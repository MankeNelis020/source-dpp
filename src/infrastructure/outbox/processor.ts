import { MemoryEmailPort, type EmailPort, type PersistencePort } from "@/infrastructure/database/ports";
import {
  isRetryableOutboxError,
  nextBackoff,
  outboxMaxAttempts,
  type OutboxProcessor,
  type OutboxRecord,
} from "@/infrastructure/outbox/types";
import { METRICS, metricInc, metricSet, logOperational } from "@/infrastructure/observability/metrics";
import {
  EmailProviderError,
  isEmailSendResult,
  type EmailCategory,
  type EmailProvider,
  type EmailSendResult,
  type OutboundEmail,
} from "@/infrastructure/email/port";
import { renderEmailByTemplate } from "@/infrastructure/email/templates";
import type { EmailTemplateId, OutboundMessageRecord } from "@/infrastructure/email/transport";
import { loadSourceEnvironment } from "@/infrastructure/environment/source-environment";
import { persistTransportFailureTask } from "@/server/source/email-events";

export class PersistenceOutboxProcessor implements OutboxProcessor {
  constructor(private readonly store: PersistencePort) {}

  claimBatch(limit: number, now?: Date) {
    return this.store.claimOutboxBatch(limit, now);
  }

  markSucceeded(id: string, processedAt?: Date) {
    this.store.markOutboxSucceeded(id, processedAt);
  }

  markFailed(id: string, error: string, nextAttemptAt: Date, deadLetter?: boolean) {
    this.store.markOutboxFailed(id, error, nextAttemptAt, deadLetter);
  }
}

export async function processOutboxBatch(args: {
  store: PersistencePort;
  email: EmailPort | EmailProvider;
  processor?: OutboxProcessor;
  limit?: number;
  now?: Date;
}): Promise<{ processed: number; deadLetters: string[]; claimed: number; succeeded: number; failed: number }> {
  const now = args.now ?? new Date();
  const processor = args.processor ?? new PersistenceOutboxProcessor(args.store);
  const batch = await processor.claimBatch(args.limit ?? 20, now);
  const deadLetters: string[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const row of batch) {
    try {
      await sendOutboxEmail(args.store, args.email, row, now);
      await processor.markSucceeded(row.id, now);
      succeeded += 1;
      metricInc(METRICS.emailsProviderAccepted);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = isRetryableOutboxError(error);
      const attempts = row.attemptCount + 1;
      const dead = !retryable || attempts >= outboxMaxAttempts();
      await processor.markFailed(row.id, message, nextBackoff(attempts, now), dead);
      metricInc(METRICS.outboxRetry);
      failed += 1;
      await markOutboundFailed(args.store, row, message, now);
      if (dead) {
        deadLetters.push(row.id);
        metricInc(METRICS.outboxDeadLetter);
        metricInc(METRICS.emailsFailed);
        await persistTransportFailureTask(args.store, row, now);
        logOperational("outbox.dead_letter", {
          organisationId: row.organisationId,
          semanticKey: row.semanticKey,
          aggregateId: row.aggregateId,
        });
      }
    }
  }

  metricSet(
    METRICS.outboxPending,
    (await args.store.countOutbox("PENDING")) + (await args.store.countOutbox("FAILED"))
  );
  return { processed: batch.length, deadLetters, claimed: batch.length, succeeded, failed };
}

async function sendOutboxEmail(
  store: PersistencePort,
  email: EmailPort | EmailProvider,
  row: OutboxRecord,
  now: Date
) {
  const to = String(row.payload.to ?? "");
  if (!to) {
    throw new EmailProviderError("invalid recipient", { retryable: false, permanent: true });
  }
  const message = buildOutboundEmail(row, to);
  const existing = await store.getOutboundMessageBySemanticKey(row.organisationId, row.semanticKey);
  if (existing) {
    existing.transportStatus = existing.transportStatus === "QUEUED" ? "SUBMITTING" : existing.transportStatus;
    await store.saveOutboundMessage(existing);
  }

  const result = await deliver(email, message);
  await persistAccepted(store, row, existing, result, now);
  await redactOutboxSecrets(store, row);
}

function buildOutboundEmail(row: OutboxRecord, to: string): OutboundEmail {
  const templateId = (String(row.payload.templateId ?? "SUPPLIER_REQUEST") as EmailTemplateId) || "SUPPLIER_REQUEST";
  const portalUrlInBody = typeof row.payload.html === "string" && row.payload.html.includes("/s/");
  let subject = String(row.payload.subject ?? row.eventType);
  let text = String(row.payload.text ?? "SOURCE operational notification.");
  let html = typeof row.payload.html === "string" ? row.payload.html : `<p>${text}</p>`;
  if (!portalUrlInBody && typeof row.payload.portalUrl === "string") {
    const rendered = renderEmailByTemplate(templateId, {
      organisationName: String(row.payload.organisationName ?? "A manufacturer"),
      itemCount: Number(row.payload.itemCount ?? 1),
      portalUrl: String(row.payload.portalUrl),
      expiresAt: new Date(String(row.payload.expiresAt ?? Date.now() + 14 * 86400000)),
      hideCustomer: Boolean(row.payload.hideCustomer),
    });
    subject = rendered.subject;
    text = rendered.text;
    html = rendered.html;
  }
  return {
    semanticKey: row.semanticKey,
    to: [to],
    from: String(row.payload.from ?? "SOURCE <requests@localhost>"),
    replyTo: typeof row.payload.replyTo === "string" && row.payload.replyTo ? row.payload.replyTo : replyToAddress(),
    subject,
    html,
    text,
    category: (String(row.payload.kind ?? "SUPPLIER_REQUEST") as EmailCategory) || "SUPPLIER_REQUEST",
    tags: {
      category: String(row.payload.kind ?? "SUPPLIER_REQUEST"),
      template: templateId,
    },
  };
}

async function deliver(email: EmailPort | EmailProvider, message: OutboundEmail): Promise<EmailSendResult> {
  if (!(email instanceof MemoryEmailPort)) {
    const result = await (email as EmailProvider).send(message);
    if (isEmailSendResult(result)) return result;
  }
  const result = await (email as EmailPort).send({
    to: message.to[0],
    subject: message.subject,
    text: message.text,
    html: message.html,
    idempotencyKey: message.semanticKey,
  });
  if (result === "ALREADY_PROCESSED") {
    return {
      provider: "TEST",
      providerMessageId: `test:${message.semanticKey}`,
      acceptedAt: new Date().toISOString(),
      duplicate: true,
    };
  }
  return {
    provider: "TEST",
    providerMessageId: `test:${message.semanticKey}`,
    acceptedAt: new Date().toISOString(),
  };
}

async function persistAccepted(
  store: PersistencePort,
  row: OutboxRecord,
  existing: OutboundMessageRecord | undefined,
  result: EmailSendResult,
  now: Date
) {
  const current = existing ?? (await store.getOutboundMessageBySemanticKey(row.organisationId, row.semanticKey));
  const acceptedAt = result.acceptedAt || now.toISOString();
  if (current) {
    if (current.transportStatus === "DELIVERED" || current.transportStatus === "BOUNCED" || current.transportStatus === "COMPLAINED") {
      return;
    }
    current.provider = result.provider;
    current.providerMessageId = result.providerMessageId;
    current.transportStatus = "PROVIDER_ACCEPTED";
    current.providerAcceptedAt = current.providerAcceptedAt ?? acceptedAt;
    await store.saveOutboundMessage(current);
    return;
  }
  await store.saveOutboundMessage({
    id: store.nextId("omsg"),
    organisationId: row.organisationId,
    caseId: row.aggregateId,
    supplierActorId: typeof row.payload.supplierActorId === "string" ? row.payload.supplierActorId : undefined,
    portalGrantId: typeof row.payload.portalGrantId === "string" ? row.payload.portalGrantId : undefined,
    outboxEventId: row.id,
    semanticKey: row.semanticKey,
    recipient: String(row.payload.to ?? ""),
    fromAddress: String(row.payload.from ?? "SOURCE <requests@localhost>"),
    templateId: (String(row.payload.templateId ?? "SUPPLIER_REQUEST") as EmailTemplateId) || "SUPPLIER_REQUEST",
    templateVersion: String(row.payload.templateVersion ?? "v1"),
    category: String(row.payload.kind ?? "SUPPLIER_REQUEST"),
    provider: result.provider,
    providerMessageId: result.providerMessageId,
    transportStatus: "PROVIDER_ACCEPTED",
    tokenFingerprint: typeof row.payload.tokenFingerprint === "string" ? row.payload.tokenFingerprint : undefined,
    createdAt: row.createdAt,
    providerAcceptedAt: acceptedAt,
  });
}

async function redactOutboxSecrets(store: PersistencePort, row: OutboxRecord) {
  const next = { ...row.payload };
  delete next.html;
  delete next.text;
  delete next.portalUrl;
  delete next.token;
  next.redacted = true;
  await store.updateOutboxPayload(row.id, next);
}

async function markOutboundFailed(store: PersistencePort, row: OutboxRecord, error: string, now: Date) {
  const current = await store.getOutboundMessageBySemanticKey(row.organisationId, row.semanticKey);
  if (!current) return;
  if (current.transportStatus === "DELIVERED" || current.transportStatus === "BOUNCED" || current.transportStatus === "COMPLAINED") {
    return;
  }
  current.transportStatus = "FAILED";
  current.lastError = error;
  current.lastProviderEventAt = now.toISOString();
  await store.saveOutboundMessage(current);
}

function replyToAddress() {
  try {
    return loadSourceEnvironment().emailReplyTo;
  } catch {
    return undefined;
  }
}

/** @deprecated Use persistTransportFailureTask */
export async function recordDeliveryFailure(store: PersistencePort, row: OutboxRecord, now = new Date()) {
  await persistTransportFailureTask(store, row, now);
}
