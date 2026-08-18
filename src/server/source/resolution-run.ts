import { applyCommand, hydrateEngineState } from "@/domain/source/engine";
import { recordContactAvoided, recordRequirementOutcome } from "@/domain/source/analytics";
import { gatherPlannerInput, planResolution } from "@/domain/source/planner";
import type { PersistencePort } from "@/infrastructure/database/ports";
import { findReusableClaimsForRequirement } from "@/server/source/network";
import type { Principal } from "@/server/source/types";
import { SourceError } from "@/server/source/types";
import { hasCapability } from "@/server/source/authorization";

const ACTIVE_REQUEST_STATES = new Set([
  "DRAFT",
  "QUEUED",
  "SENT",
  "DELIVERED",
  "OPENED",
  "STARTED",
  "PARTIAL",
  "SUBMITTED",
  "NO_RESPONSE",
  "WRONG_CONTACT",
  "UNKNOWN_INFORMATION",
  "NEEDS_UPSTREAM",
  "CONFIDENTIAL",
]);

export function executeResolutionRunKey(organisationId: string, runId: string) {
  return `${organisationId}:pilot:${runId}:EXECUTE:v1`;
}

export async function executeResolutionRun(store: PersistencePort, principal: Principal, now = new Date()) {
  if (!hasCapability(principal, "case:resolve") && !hasCapability(principal, "supplier:request")) {
    throw new SourceError("FORBIDDEN", "You cannot start resolution.", 403);
  }

  return store.transaction(async (tx) => {
    const state = hydrateEngineState(await tx.loadEngine(principal.organisationId));
    const run = state.pilotRuns[state.pilotRuns.length - 1];
    if (!run) {
      throw new SourceError("VALIDATION", "Import a catalogue before letting SOURCE handle the gaps.", 400);
    }

    const idempotencyKey = executeResolutionRunKey(principal.organisationId, run.id);
    const existing = await tx.findProcessedCommand(principal.organisationId, idempotencyKey);
    if (existing) {
      return {
        run,
        groups: state.requestGroups.length,
        requestCount: state.requests.length,
        alreadyExecuted: true,
      };
    }

    const started = Date.now();
    run.executionStartedAt = run.executionStartedAt ?? now.toISOString();

    const open = state.cases.filter(
      (c) => !["READY", "MONITORING", "UNRESOLVED", "WAITING_RESPONSE", "WAITING_UPSTREAM"].includes(c.state)
    );

    for (const resolution of open) {
      const requirement = state.requirements.find((r) => r.id === resolution.requirementId);
      if (!requirement || requirement.resolvedAt) continue;
      if (state.requests.some((r) => r.caseId === resolution.id && ACTIVE_REQUEST_STATES.has(r.status))) continue;

      const network = await findReusableClaimsForRequirement(tx, principal, {
        subjectId: requirement.subjectId,
        propertyId: requirement.propertyId,
        requiredTrustLevel: requirement.requiredTrustLevel,
        purpose: requirement.purpose,
      });
      const localReady = state.claims.find(
        (c) => c.subjectId === requirement.subjectId && c.propertyId === requirement.propertyId && c.ready
      );
      if (network.outcome === "READY") {
        requirement.resolvedAt = now.toISOString();
        resolution.state = "READY";
        resolution.resolutionOutcome = "READY";
        resolution.closedAt = now.toISOString();
        recordRequirementOutcome(state, {
          requirementId: requirement.id,
          mechanism: localReady ? "EXISTING_CLAIM" : "CROSS_TENANT_REUSE",
          claimId: localReady?.id,
          recordedAt: now.toISOString(),
        });
        recordContactAvoided(state, {
          requirementId: requirement.id,
          caseId: resolution.id,
          supplierActorId: resolution.currentActorId,
          avoidedBy: "EXISTING_CLAIM",
          timestamp: now.toISOString(),
        });
        continue;
      }
      if (network.outcome === "AUTHORIZATION_REQUIRED") {
        resolution.state = "AUTHORIZATION_REQUIRED";
        recordContactAvoided(state, {
          requirementId: requirement.id,
          caseId: resolution.id,
          supplierActorId: resolution.currentActorId,
          avoidedBy: "AUTHORIZATION_ONLY",
          timestamp: now.toISOString(),
        });
        continue;
      }

      const plan = planResolution(
        gatherPlannerInput({
          state,
          requirement,
          identityMatched: resolution.identityStatus === "IDENTITY_MATCHED",
          identityNeedsReview: resolution.state === "IDENTITY_REVIEW",
          declaredSupplierId: resolution.currentActorId,
          now,
        })
      );
      requirement.selectedRoute = plan.strategy;
      requirement.selectedRouteReason = plan.reason;
      if (plan.strategy === "supplier_request" && resolution.currentActorId) {
        const result = applyCommand(state, { type: "SEND_REQUEST", caseId: resolution.id }, now);
        Object.assign(state, result.state);
      }
    }

    const groups = new Map<string, string[]>();
    for (const request of state.requests) {
      const resolution = state.cases.find((c) => c.id === request.caseId);
      const requirement = resolution ? state.requirements.find((r) => r.id === resolution.requirementId) : undefined;
      if (!requirement) continue;
      const key = `${request.supplierId}:${requirement.propertyId}`;
      const list = groups.get(key) ?? [];
      list.push(request.caseId);
      groups.set(key, list);
    }
    state.requestGroups = [...groups.entries()].map(([key, caseIds], index) => {
      const [supplierActorId, propertyId] = key.split(":");
      return { id: `grp-${index + 1}`, supplierActorId, propertyId, caseIds, createdAt: now.toISOString() };
    });

    run.cost = {
      extractionCalls: 0,
      documentsProcessed: state.evidence.length,
      emailsQueued: state.requests.filter((r) => Date.parse(r.sentAt ?? run.executionStartedAt ?? run.startedAt) >= Date.parse(run.executionStartedAt ?? run.startedAt)).length,
      backgroundJobs: 1,
      storageBytes: Buffer.byteLength(JSON.stringify(state), "utf8"),
      humanReviews: state.tasks.filter((t) => t.status === "open").length,
      aggregateBytes: Buffer.byteLength(JSON.stringify(state), "utf8"),
      plannerDurationMs: Date.now() - started,
    };

    await tx.saveEngine(principal.organisationId, state);
    await tx.saveProcessedCommand({
      id: tx.nextId("pcmd"),
      idempotencyKey,
      organisationId: principal.organisationId,
      principalId: principal.userId,
      commandType: "EXECUTE_RESOLUTION_RUN",
      result: {
        status: "ok",
        events: [{ type: "RESOLUTION_RUN_STARTED", detail: "Let SOURCE handle the gaps." }],
        sideEffects: [{ type: "execute_resolution_run", key: idempotencyKey }],
      },
      processedAt: now.toISOString(),
    });

    return {
      run: state.pilotRuns[state.pilotRuns.length - 1],
      groups: state.requestGroups.length,
      requestCount: state.requests.length,
      alreadyExecuted: false,
    };
  });
}
