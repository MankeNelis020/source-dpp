const counters = new Map<string, number>();

export function metricInc(name: string, by = 1) {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

export function metricSet(name: string, value: number) {
  counters.set(name, value);
}

export function metricSnapshot(): Record<string, number> {
  return Object.fromEntries(counters);
}

export function metricReset() {
  counters.clear();
}

export function logOperational(event: string, fields: Record<string, string | number | boolean | undefined>) {
  const safe: Record<string, string | number | boolean> = { event };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (/token|secret|password|filename|actorName|legalName/i.test(key)) continue;
    safe[key] = value;
  }
  safe.ts = new Date().toISOString();
  console.info(JSON.stringify(safe));
}

export const METRICS = {
  commandsProcessed: "commands.processed",
  commandsIdempotentReplay: "commands.idempotent_replay",
  commandsCaseChanged: "commands.case_changed",
  authzDenied: "authz.denied",
  portalRateLimited: "portal.rate_limited",
  evidenceAccessDenied: "evidence.access_denied",
  outboxPending: "outbox.pending",
  outboxDeadLetter: "outbox.dead_letter",
  outboxRetry: "outbox.retry_count",
} as const;
