import { applyCommand, caseReadiness } from "@/domain/source/engine";
import type { Command, EngineState } from "@/domain/source/types";
import type { PersistencePort } from "@/infrastructure/database/ports";
import { SlidingWindowLimiter } from "@/infrastructure/crypto/tokens";
import { authorizePortalCommand, authorizeUserCommand } from "../authorization";
import { propagateReadyClaim } from "@/domain/source/propagation";
import type { AnyPrincipal, CommandEnvelope, CommandOutcome, Principal } from "../types";
import { SourceError } from "../types";

const portalLimiter = new SlidingWindowLimiter(60);

function caseIdOf(command: Command): string | undefined {
  if ("caseId" in command) return command.caseId;
  return undefined;
}

function sideEffectsFrom(events: { type: string }[], caseId?: string) {
  return events
    .filter((e) => e.type === "request.sent" || e.type === "AUTO_REMINDER_SENT")
    .map((e) => ({ type: "email.queued", key: `${caseId ?? "unknown"}:${e.type}` }));
}

export function resolveUserPrincipal(store: PersistencePort, userId: string, organisationId: string): Principal {
  const user = store.getUserById(userId);
  const membership = store.getMembership(userId, organisationId);
  if (!user || !membership) throw new SourceError("UNAUTHENTICATED", "Sign in required.", 401);
  return {
    kind: "user",
    userId,
    organisationId,
    membershipId: membership.id,
    roles: [membership.role],
    capabilities: membership.capabilities,
    email: user.email,
  };
}

export function dispatchCommand(args: {
  store: PersistencePort;
  principal: AnyPrincipal;
  envelope: CommandEnvelope;
  now?: Date;
}): CommandOutcome {
  const now = args.now ?? new Date();
  const { store, principal, envelope } = args;

  if (principal.kind === "user") {
    if (envelope.organisationId !== principal.organisationId) {
      throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
    }
    authorizeUserCommand(principal, envelope.command);
  } else {
    if (!portalLimiter.allow(principal.grantId)) {
      throw new SourceError("RATE_LIMITED", "Too many portal attempts.", 429);
    }
    authorizePortalCommand(principal, envelope.command);
  }

  const organisationId = principal.organisationId;
  const existing = store.findProcessedCommand(organisationId, envelope.idempotencyKey);
  if (existing) {
    if (existing.result.status === "error") return existing.result;
    return { ...existing.result, status: "ALREADY_PROCESSED" };
  }

  const state = store.loadEngine(organisationId);
  const caseId = caseIdOf(envelope.command);
  if (caseId) {
    const resolution = state.cases.find((c) => c.id === caseId);
    if (!resolution) throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
    if (envelope.expectedVersion !== undefined && resolution.version !== envelope.expectedVersion) {
      throw new SourceError("CASE_CHANGED", "This case changed while you were working. Refresh to continue.", 409);
    }
  }

  const result = applyCommand(state, envelope.command, now);
  if (result.caseId) {
    const claim = result.state.claims.find((c) => c.caseId === result.caseId && c.ready);
    if (claim) propagateReadyClaim(result.state, claim.id, now);
  }

  store.saveEngine(organisationId, result.state);

  const outcome: CommandOutcome = {
    status: "ok",
    caseId: result.caseId,
    version: result.caseId ? result.state.cases.find((c) => c.id === result.caseId)?.version : undefined,
    events: result.events.map((e) => ({ type: e.type, detail: e.detail })),
    sideEffects: sideEffectsFrom(result.events, result.caseId),
  };

  store.saveProcessedCommand({
    id: envelope.commandId,
    idempotencyKey: envelope.idempotencyKey,
    organisationId,
    principalId: envelope.principalId,
    commandType: envelope.command.type,
    result: outcome,
    processedAt: now.toISOString(),
  });

  store.appendAudit({
    id: store.nextId("aud"),
    organisationId,
    principalId: envelope.principalId,
    action: envelope.command.type,
    resource: result.caseId,
    result: "ok",
    commandId: envelope.commandId,
    detail: outcome.events.map((e) => e.detail).join(" ") || envelope.command.type,
    createdAt: now.toISOString(),
    policyVersion: "p0-v1",
  });

  return outcome;
}

export function assertReadinessInvariant(state: EngineState) {
  for (const claim of state.claims) {
    if (!claim.caseId) continue;
    const resolution = state.cases.find((c) => c.id === claim.caseId);
    if (!resolution) continue;
    const evaluated = caseReadiness(state, resolution.id).ready;
    if (claim.ready !== evaluated) {
      throw new Error(`Readiness invariant failed for ${claim.id}: stored=${claim.ready} evaluated=${evaluated}`);
    }
  }
}
