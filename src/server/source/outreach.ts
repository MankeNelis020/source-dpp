import { generateBearerToken, hashToken, tokenFingerprint } from "@/infrastructure/crypto/tokens";
import type { PersistencePort } from "@/infrastructure/database/ports";
import type { OutboxRecord } from "@/infrastructure/outbox/types";
import type { EngineState } from "@/domain/source/types";
import { issuePortalGrant } from "@/server/source/portal";
import { renderEmailByTemplate } from "@/infrastructure/email/templates";
import type { EmailTemplateId } from "@/infrastructure/email/transport";
import { portalUrlForToken } from "@/infrastructure/email/origin";
import { normalizeEmail } from "@/infrastructure/email/validate";
import { loadSourceEnvironment } from "@/infrastructure/environment/source-environment";
import { isConfidentialActor } from "@/server/source/confidentiality";
import { METRICS, metricInc } from "@/infrastructure/observability/metrics";

const GRANT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function contactEmailForActor(state: EngineState, actorId: string | undefined) {
  if (!actorId) return undefined;
  const contacts = state.contacts.filter(
    (c) => c.actorId === actorId && c.valid && !c.doNotContact && normalizeEmail(c.email)
  );
  const chosen = contacts.find((c) => c.primary) ?? contacts[0];
  return chosen ? normalizeEmail(chosen.email) : undefined;
}

export function contactIdForEmail(state: EngineState, actorId: string | undefined, email: string | undefined) {
  if (!actorId || !email) return undefined;
  const normalized = normalizeEmail(email);
  return state.contacts.find((c) => c.actorId === actorId && normalizeEmail(c.email) === normalized)?.id;
}

export async function queueSupplierOutreach(args: {
  store: PersistencePort;
  organisationId: string;
  organisationName: string;
  state: EngineState;
  supplierActorId: string;
  caseIds: string[];
  semanticKey: string;
  now: Date;
  templateId?: EmailTemplateId;
}): Promise<OutboundQueueResult | undefined> {
  const { store, organisationId, organisationName, state, supplierActorId, caseIds, semanticKey, now } = args;
  const uniqueCaseIds = [...new Set(caseIds)];
  if (!uniqueCaseIds.length) return undefined;
  const to = contactEmailForActor(state, supplierActorId);
  if (!to) return undefined;

  const templateId: EmailTemplateId = args.templateId ?? templateFromSemanticKey(semanticKey);
  const token = generateBearerToken();
  const fingerprint = tokenFingerprint(token);
  const expiresAt = new Date(now.getTime() + GRANT_TTL_MS);
  const requirementIds = uniqueCaseIds
    .map((id) => state.cases.find((c) => c.id === id)?.requirementId)
    .filter((id): id is string => Boolean(id));

  const grant = await issuePortalGrant(store, {
    token,
    actorId: supplierActorId,
    organisationId,
    allowedCaseIds: uniqueCaseIds,
    allowedRequirementIds: requirementIds,
    expiresAt: expiresAt.toISOString(),
  });

  const hideCustomer = isConfidentialActor(state, supplierActorId);
  const rendered = renderEmailByTemplate(templateId, {
    organisationName,
    itemCount: uniqueCaseIds.length,
    portalUrl: portalUrlForToken(token),
    expiresAt,
    hideCustomer,
  });

  const fromAddress = fromAddressFor(organisationName);
  const requestId = uniqueCaseIds
    .map((id) => state.requests.find((r) => r.caseId === id)?.id)
    .find(Boolean);

  const inbound = inboundReplyAddress();
  if (inbound) {
    await store.saveInboundCorrelation({
      id: store.nextId("inbcorr"),
      organisationId,
      caseId: uniqueCaseIds[0],
      requestId,
      tokenHash: hashToken(inbound.token),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  }

  const outbox: OutboxRecord = {
    id: store.nextId("obx"),
    organisationId,
    eventType: "email.queued",
    aggregateType: "SupplierRequest",
    aggregateId: uniqueCaseIds[0],
    semanticKey,
    payload: {
      kind: rendered.category,
      templateId: rendered.templateId,
      templateVersion: rendered.templateVersion,
      to,
      from: fromAddress,
      replyTo: inbound?.address,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      supplierActorId,
      caseIds: uniqueCaseIds,
      requestId,
      itemCount: uniqueCaseIds.length,
      portalGrantId: grant.id,
      tokenFingerprint: fingerprint,
      expiresAt: expiresAt.toISOString(),
      organisationName,
      hideCustomer,
      contactId: contactIdForEmail(state, supplierActorId, to),
    },
    status: "PENDING",
    availableAt: now.toISOString(),
    attemptCount: 0,
    createdAt: now.toISOString(),
  };

  return {
    outbox,
    message: {
      organisationId,
      caseId: uniqueCaseIds[0],
      requestId,
      supplierActorId,
      portalGrantId: grant.id,
      outboxEventId: outbox.id,
      semanticKey,
      recipient: to,
      fromAddress,
      templateId: rendered.templateId,
      templateVersion: rendered.templateVersion,
      category: rendered.category,
      tokenFingerprint: fingerprint,
    },
  };
}

export interface OutboundQueueResult {
  outbox: OutboxRecord;
  message: {
    organisationId: string;
    caseId: string;
    requestId?: string;
    supplierActorId: string;
    portalGrantId: string;
    outboxEventId: string;
    semanticKey: string;
    recipient: string;
    fromAddress: string;
    templateId: EmailTemplateId;
    templateVersion: string;
    category: string;
    tokenFingerprint: string;
  };
}

export async function persistQueuedOutreach(store: PersistencePort, queued: OutboundQueueResult, now = new Date()) {
  const inserted = await store.insertOutbox(queued.outbox);
  if (!inserted) return false;
  await store.saveOutboundMessage({
    id: store.nextId("omsg"),
    organisationId: queued.message.organisationId,
    caseId: queued.message.caseId,
    requestId: queued.message.requestId,
    supplierActorId: queued.message.supplierActorId,
    portalGrantId: queued.message.portalGrantId,
    outboxEventId: queued.outbox.id,
    semanticKey: queued.message.semanticKey,
    recipient: queued.message.recipient,
    fromAddress: queued.message.fromAddress,
    templateId: queued.message.templateId,
    templateVersion: queued.message.templateVersion,
    category: queued.message.category,
    provider: "TEST",
    transportStatus: "QUEUED",
    tokenFingerprint: queued.message.tokenFingerprint,
    createdAt: now.toISOString(),
  });
  metricInc(METRICS.emailsQueued);
  return true;
}

function templateFromSemanticKey(semanticKey: string): EmailTemplateId {
  if (semanticKey.includes(":REMINDER:")) return "REMINDER";
  if (semanticKey.includes(":AUTHORIZATION:")) return "AUTHORIZATION";
  if (semanticKey.includes(":UPSTREAM:")) return "UPSTREAM";
  return "SUPPLIER_REQUEST";
}

function fromAddressFor(organisationName: string) {
  try {
    const env = loadSourceEnvironment();
    if (env.emailFrom) return env.emailFrom.includes("<")
      ? env.emailFrom
      : `${organisationName} via SOURCE <${env.emailFrom}>`;
  } catch {
    /* local tests */
  }
  return `${organisationName} via SOURCE <requests@localhost>`;
}

function inboundReplyAddress(): { token: string; address: string } | undefined {
  try {
    const domain = loadSourceEnvironment().inboundReplyDomain;
    if (!domain) return undefined;
    const token = generateBearerToken();
    return { token, address: `reply+${token}@${domain}` };
  } catch {
    return undefined;
  }
}
