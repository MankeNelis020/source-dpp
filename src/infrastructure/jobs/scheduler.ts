import type { PersistencePort } from "@/infrastructure/database/ports";

interface Scheduled {
  id: string;
  name: string;
  runAt: Date;
  payload: Record<string, string>;
  cancelled: boolean;
}

export class MemoryWorkflowScheduler {
  private items: Scheduled[] = [];
  private seq = 1;

  schedule(input: { name: string; runAt: Date; payload: Record<string, string> }): string {
    const id = `wf-${this.seq++}`;
    this.items.push({ id, ...input, cancelled: false });
    return id;
  }

  cancel(id: string) {
    const item = this.items.find((i) => i.id === id);
    if (item) item.cancelled = true;
  }

  reschedule(id: string, at: Date) {
    const item = this.items.find((i) => i.id === id);
    if (item && !item.cancelled) item.runAt = at;
  }

  due(now: Date) {
    return this.items.filter((i) => !i.cancelled && i.runAt <= now).map(({ id, name, payload }) => ({ id, name, payload }));
  }
}

export async function autonomousResolutionRate(store: PersistencePort, organisationId: string) {
  const state = await store.loadEngine(organisationId);
  const resolved = state.requirements.filter((r) => r.resolvedAt);
  if (!resolved.length) return 0;
  const withoutHuman = resolved.filter((r) => {
    const resolution = state.cases.find((c) => c.id === r.linkedCaseId);
    return resolution && resolution.automationLevel !== "L0";
  });
  return withoutHuman.length / resolved.length;
}

export async function supplierContactAvoidanceRate(store: PersistencePort, organisationId: string) {
  const state = await store.loadEngine(organisationId);
  const missing = state.requirements.length;
  if (!missing) return 0;
  const withoutOutreach = state.requirements.filter((r) => {
    const resolution = state.cases.find((c) => c.id === r.linkedCaseId);
    if (!resolution) return false;
    return !state.attempts.some((a) => a.caseId === resolution.id && (a.method === "email_request" || a.method === "upstream_request"));
  }).length;
  return withoutOutreach / missing;
}
