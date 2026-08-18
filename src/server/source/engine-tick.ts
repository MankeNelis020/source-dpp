import { dispatchCommand } from "@/server/source/commands/dispatch";
import { sourceSystemPrincipal } from "@/server/source/types";
import type { PersistencePort } from "@/infrastructure/database/ports";
import { logOperational } from "@/infrastructure/observability/metrics";

const TICKABLE = new Set(["WAITING_RESPONSE", "WAITING_UPSTREAM", "REQUEST_PENDING"]);

export async function tickDueOrganisations(store: PersistencePort, now = new Date()) {
  const organisationIds = await store.listOrganisationIds();
  let ticked = 0;
  let organisations = 0;
  for (const organisationId of organisationIds) {
    const result = await tickOrganisation(store, organisationId, now);
    organisations += 1;
    ticked += result.ticked;
  }
  logOperational("engine.tick", { organisations, ticked });
  return { organisations, ticked };
}

export async function tickOrganisation(store: PersistencePort, organisationId: string, now = new Date()) {
  const state = await store.loadEngine(organisationId);
  const due = state.cases.filter((resolution) => {
    if (!TICKABLE.has(resolution.state)) return false;
    if (!resolution.nextActionAt) return false;
    return new Date(resolution.nextActionAt).getTime() <= now.getTime();
  });
  let ticked = 0;
  for (const resolution of due) {
    const outcome = await dispatchCommand({
      store,
      principal: sourceSystemPrincipal(organisationId),
      envelope: {
        commandId: store.nextId("tick"),
        idempotencyKey: `tick:${resolution.id}:${resolution.nextActionAt}`,
        principalId: "SOURCE_SYSTEM",
        organisationId,
        issuedAt: now.toISOString(),
        command: { type: "TICK_NO_RESPONSE", caseId: resolution.id },
      },
      now,
    });
    if (outcome.status === "ok" || outcome.status === "ALREADY_PROCESSED") {
      ticked += 1;
    }
  }
  return { ticked, due: due.length };
}
