export type OutboxStatus = "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "DEAD_LETTER";

export interface OutboxRecord {
  id: string;
  organisationId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  semanticKey: string;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  availableAt: string;
  attemptCount: number;
  lastError?: string;
  createdAt: string;
  processedAt?: string;
}

export interface OutboxProcessor {
  claimBatch(limit: number, now?: Date): Promise<OutboxRecord[]> | OutboxRecord[];
  markSucceeded(id: string, processedAt?: Date): Promise<void> | void;
  markFailed(id: string, error: string, nextAttemptAt: Date, deadLetter?: boolean): Promise<void> | void;
}

export const OUTBOX_MAX_ATTEMPTS = 5;

export function outboxMaxAttempts(): number {
  const raw = Number(process.env.SOURCE_OUTBOX_MAX_ATTEMPTS);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return OUTBOX_MAX_ATTEMPTS;
}

export function semanticRequestKey(caseId: string): string {
  return `${caseId}:REQUEST_INITIAL:v1`;
}

export function semanticReminderKey(caseId: string, day: number): string {
  return `${caseId}:REMINDER:DAY${day}:v1`;
}

export function semanticSecondaryContactKey(caseId: string): string {
  return `${caseId}:SECONDARY_CONTACT:v1`;
}

export function semanticManualResendKey(caseId: string, n: number): string {
  return `${caseId}:MANUAL_RESEND:${n}:v1`;
}

export function semanticAuthorizationKey(caseId: string): string {
  return `${caseId}:AUTHORIZATION:v1`;
}

export function semanticUpstreamKey(caseId: string, actorId: string): string {
  return `${caseId}:UPSTREAM:${actorId}:v1`;
}

export function isRetryableOutboxError(error: unknown): boolean {
  if (error && typeof error === "object" && "retryable" in error) {
    return Boolean((error as { retryable: unknown }).retryable);
  }
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/invalid recipient|revoked portal grant|structurally invalid|authorization failure|FORBIDDEN|VALIDATION/i.test(msg)) {
    return false;
  }
  if (/timeout|ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENOTFOUND|429|5\d\d|temporar|unavailable/i.test(msg)) {
    return true;
  }
  if (/4\d\d/.test(msg)) return false;
  return true;
}

export function nextBackoff(attemptCount: number, now = new Date()): Date {
  const capped = Math.min(attemptCount, 8);
  const baseMs = Math.min(2 ** capped * 1000, 60 * 60 * 1000);
  const jitter = Math.floor(Math.random() * 250);
  return new Date(now.getTime() + baseMs + jitter);
}

export function reminderDayFromCount(reminderCount: number): number {
  if (reminderCount <= 1) return 3;
  if (reminderCount === 2) return 7;
  if (reminderCount === 3) return 10;
  return 14;
}
