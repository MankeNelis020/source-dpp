import type { EmailPort, PersistencePort } from "@/infrastructure/database/ports";
import {
  isRetryableOutboxError,
  nextBackoff,
  OUTBOX_MAX_ATTEMPTS,
  type OutboxProcessor,
  type OutboxRecord,
} from "@/infrastructure/outbox/types";
import { METRICS, metricInc, metricSet, logOperational } from "@/infrastructure/observability/metrics";

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
  email: EmailPort;
  processor?: OutboxProcessor;
  limit?: number;
  now?: Date;
}): Promise<{ processed: number; deadLetters: string[] }> {
  const now = args.now ?? new Date();
  const processor = args.processor ?? new PersistenceOutboxProcessor(args.store);
  const batch = await processor.claimBatch(args.limit ?? 20, now);
  const deadLetters: string[] = [];

  for (const row of batch) {
    try {
      await args.email.send({
        to: "noreply@source.invalid",
        subject: String(row.payload.kind ?? row.eventType),
        text: "SOURCE operational notification.",
        idempotencyKey: row.semanticKey,
      });
      await processor.markSucceeded(row.id, now);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = isRetryableOutboxError(error);
      const attempts = row.attemptCount + 1;
      const dead = !retryable || attempts >= OUTBOX_MAX_ATTEMPTS;
      await processor.markFailed(row.id, message, nextBackoff(attempts, now), dead);
      metricInc(METRICS.outboxRetry);
      if (dead) {
        deadLetters.push(row.id);
        metricInc(METRICS.outboxDeadLetter);
        await recordDeliveryFailure(args.store, row, now);
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
  return { processed: batch.length, deadLetters };
}

export async function recordDeliveryFailure(store: PersistencePort, row: OutboxRecord, now = new Date()) {
  const state = await store.loadEngine(row.organisationId);
  const caseId = row.aggregateId;
  const already = state.tasks.some(
    (task) => task.caseId === caseId && task.title.includes("could not be delivered") && task.status === "open"
  );
  if (!already && state.cases.some((item) => item.id === caseId)) {
    state.tasks.push({
      id: store.nextId("task"),
      caseId,
      title: "Supplier reminder could not be delivered after 5 attempts.",
      context: "Transport failure. This is not supplier non-response. The case may still be waiting.",
      recommendedAction: "Check the contact mailbox or retry delivery from operations.",
      ownerLabel: "SOURCE operations",
      status: "open",
      createdAt: now.toISOString(),
      kind: "escalation",
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
