import { applyCommand } from "@/domain/source/engine";
import type { PersistencePort } from "@/infrastructure/database/ports";
import type { OutboxRecord } from "@/infrastructure/outbox/types";
import type { OutboundMessageRecord, TransportStatus } from "@/infrastructure/email/transport";
import { canAdvanceTransport, transportStatusForProviderEvent } from "@/infrastructure/email/transport";
import { METRICS, metricInc, logOperational } from "@/infrastructure/observability/metrics";
import { isConfidentialActor } from "@/server/source/confidentiality";
import { contactIdForEmail } from "@/server/source/outreach";

export async function persistTransportFailureTask(store: PersistencePort, row: OutboxRecord, now = new Date()) {
  const state = await store.loadEngine(row.organisationId);
  const caseId = row.aggregateId;
  const already = state.tasks.some(
    (task) => task.caseId === caseId && task.kind === "contact" && task.title.startsWith("We couldn't reach") && task.status === "open"
  );
  const actorId = typeof row.payload.supplierActorId === "string" ? row.payload.supplierActorId : undefined;
  const confidential = actorId ? isConfidentialActor(state, actorId) : false;
  const supplierName = confidential
    ? "a protected upstream source"
    : state.actors.find((a) => a.id === actorId)?.name ?? "this supplier";
  const recipient = confidential ? undefined : String(row.payload.to ?? "");
  if (!already && state.cases.some((item) => item.id === caseId)) {
    state.tasks.push({
      id: store.nextId("task"),
      caseId,
      title: `We couldn't reach this supplier`,
      context: [supplierName, recipient, "", "The message could not be delivered after repeated attempts. This is a transport problem, not supplier non-response."]
        .filter((line) => line !== undefined)
        .join("\n"),
      recommendedAction: "Add another contact",
      ownerLabel: "Account owner",
      status: "open",
      createdAt: now.toISOString(),
      kind: "contact",
    });
    await store.saveEngine(row.organisationId, state);
  }
  await store.appendAudit({
    id: store.nextId("aud"),
    organisationId: row.organisationId,
    principalId: "SOURCE_SYSTEM",
    action: "OUTBOX_DEAD_LETTER",
    resourceType: "ResolutionCase",
    resourceId: caseId,
    result: "failure",
    publicContext: { caseId, semanticKey: row.semanticKey },
    createdAt: now.toISOString(),
    policyVersion: "p01-v1",
  });
}

export async function applyProviderDeliveryEvent(args: {
  store: PersistencePort;
  provider: "RESEND" | "TEST";
  providerEventId: string;
  providerMessageId?: string;
  eventType: string;
  occurredAt: string;
  now?: Date;
}): Promise<{ duplicate: boolean; status?: TransportStatus }> {
  const now = args.now ?? new Date();
  const inserted = await args.store.insertEmailProviderEvent({
    id: args.store.nextId("evtmail"),
    provider: args.provider,
    providerEventId: args.providerEventId,
    providerMessageId: args.providerMessageId,
    eventType: args.eventType,
    occurredAt: args.occurredAt,
    processedAt: now.toISOString(),
  });
  if (!inserted) return { duplicate: true };

  const nextStatus = transportStatusForProviderEvent(args.eventType);
  if (!nextStatus || !args.providerMessageId) return { duplicate: false };

  const message = await args.store.getOutboundMessageByProviderId(args.provider, args.providerMessageId);
  if (!message) return { duplicate: false };

  if (!canAdvanceTransport(message.transportStatus, nextStatus)) {
    return { duplicate: false, status: message.transportStatus };
  }

  applyTimestamp(message, nextStatus, args.occurredAt);
  message.transportStatus = nextStatus;
  message.lastProviderEventAt = args.occurredAt;
  await args.store.saveOutboundMessage(message);
  bumpMetric(nextStatus);
  await applyDomainConsequences(args.store, message, nextStatus, now);
  logOperational("email.provider_event", {
    organisationId: message.organisationId,
    portalGrantId: message.portalGrantId,
    tokenFingerprint: message.tokenFingerprint,
    requestId: message.requestId,
    transportStatus: nextStatus,
  });
  return { duplicate: false, status: nextStatus };
}

function applyTimestamp(message: OutboundMessageRecord, status: TransportStatus, occurredAt: string) {
  if (status === "PROVIDER_ACCEPTED") message.providerAcceptedAt = message.providerAcceptedAt ?? occurredAt;
  if (status === "DELIVERED") message.deliveredAt = occurredAt;
  if (status === "BOUNCED") message.bouncedAt = occurredAt;
  if (status === "COMPLAINED") message.complainedAt = occurredAt;
}

function bumpMetric(status: TransportStatus) {
  if (status === "PROVIDER_ACCEPTED") metricInc(METRICS.emailsProviderAccepted);
  if (status === "DELIVERED") metricInc(METRICS.emailsDelivered);
  if (status === "BOUNCED") metricInc(METRICS.emailsBounced);
  if (status === "COMPLAINED") metricInc(METRICS.emailsComplained);
  if (status === "FAILED") metricInc(METRICS.emailsFailed);
}

async function applyDomainConsequences(
  store: PersistencePort,
  message: OutboundMessageRecord,
  status: TransportStatus,
  now: Date
) {
  if (status !== "BOUNCED" && status !== "COMPLAINED") return;
  const state = await store.loadEngine(message.organisationId);
  const caseId = message.caseId;
  if (!caseId || !state.cases.some((item) => item.id === caseId)) return;

  if (status === "BOUNCED") {
    const contactId =
      contactIdForEmail(state, message.supplierActorId, message.recipient) ??
      state.contacts.find((c) => c.actorId === message.supplierActorId && c.valid)?.id;
    if (contactId) {
      const result = applyCommand(state, { type: "MARK_BOUNCE", caseId, contactId }, now);
      await store.saveEngine(message.organisationId, result.state);
      return;
    }
    await ensureNeedsYou(store, state, message, now, {
      title: "We couldn't reach this supplier",
      context: bounceContext(state, message),
      recommendedAction: "Add another contact",
    });
    return;
  }

  const contact = state.contacts.find(
    (c) => c.actorId === message.supplierActorId && c.email.toLowerCase() === message.recipient.toLowerCase()
  );
  if (contact) contact.doNotContact = true;
  await store.saveEngine(message.organisationId, state);
  await ensureNeedsYou(store, state, message, now, {
    title: "This recipient asked us to stop emailing them",
    context: complaintContext(state, message),
    recommendedAction: "Use another contact. Do not send automatic reminders to this address.",
  });
}

async function ensureNeedsYou(
  store: PersistencePort,
  state: Awaited<ReturnType<PersistencePort["loadEngine"]>>,
  message: OutboundMessageRecord,
  now: Date,
  copy: { title: string; context: string; recommendedAction: string }
) {
  const caseId = message.caseId;
  if (!caseId) return;
  const already = state.tasks.some((task) => task.caseId === caseId && task.title === copy.title && task.status === "open");
  if (already) return;
  state.tasks.push({
    id: store.nextId("task"),
    caseId,
    title: copy.title,
    context: copy.context,
    recommendedAction: copy.recommendedAction,
    ownerLabel: "Account owner",
    status: "open",
    createdAt: now.toISOString(),
    kind: "contact",
  });
  await store.saveEngine(message.organisationId, state);
}

function bounceContext(state: Awaited<ReturnType<PersistencePort["loadEngine"]>>, message: OutboundMessageRecord) {
  const confidential = message.supplierActorId ? isConfidentialActor(state, message.supplierActorId) : false;
  if (confidential) {
    return "The email was rejected by the recipient's mail server.\nWaiting on verified upstream source.";
  }
  const name = state.actors.find((a) => a.id === message.supplierActorId)?.name ?? "Supplier";
  return `${name}\n${message.recipient}\n\nThe email was rejected by the recipient's mail server. This is not supplier non-response.`;
}

function complaintContext(state: Awaited<ReturnType<PersistencePort["loadEngine"]>>, message: OutboundMessageRecord) {
  const confidential = message.supplierActorId ? isConfidentialActor(state, message.supplierActorId) : false;
  if (confidential) return "A protected upstream recipient marked SOURCE mail as unwanted. Automatic reminders are stopped.";
  const name = state.actors.find((a) => a.id === message.supplierActorId)?.name ?? "Supplier";
  return `${name}\nAutomatic reminders to this address are stopped until you choose another contact.`;
}
