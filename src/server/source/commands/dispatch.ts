import { applyCommand, caseReadiness } from "@/domain/source/engine";
import type { Command, EngineState } from "@/domain/source/types";
import type { PersistencePort } from "@/infrastructure/database/ports";
import type { RateLimiter } from "@/infrastructure/rate-limit/port";
import { portalRateLimitKeys } from "@/infrastructure/rate-limit/port";
import { getMemoryRateLimiter } from "@/infrastructure/rate-limit/memory";
import {
  reminderDayFromCount,
  semanticReminderKey,
  semanticRequestKey,
  semanticSecondaryContactKey,
  type OutboxRecord,
} from "@/infrastructure/outbox/types";
import { METRICS, metricInc, logOperational } from "@/infrastructure/observability/metrics";
import { authorizePortalCommand, authorizeUserCommand, ROLE_CAPABILITIES } from "../authorization";
import { propagateReadyClaim } from "@/domain/source/propagation";
import { structuredCommandAudit } from "../audit";
import type { AnyPrincipal, CommandEnvelope, CommandOutcome, Principal } from "../types";
import { SourceError } from "../types";
import { queueSupplierOutreach } from "@/server/source/outreach";
import { durableEvidenceRequired } from "@/infrastructure/runtime";

function caseIdOf(command: Command): string | undefined {
  if ("caseId" in command) return command.caseId;
  return undefined;
}

async function outboxForEvents(args: {
  store: PersistencePort;
  organisationId: string;
  organisationName: string;
  state: EngineState;
  events: { type: string }[];
  caseId?: string;
  now: Date;
}): Promise<OutboxRecord[]> {
  const { store, organisationId, organisationName, state, events, caseId, now } = args;
  if (!caseId) return [];
  const request = state.requests.find((item) => item.caseId === caseId);
  const rows: OutboxRecord[] = [];
  for (const event of events) {
    let semanticKey: string | undefined;
    if (event.type === "request.sent") semanticKey = semanticRequestKey(caseId);
    if (event.type === "AUTO_REMINDER_SENT") {
      semanticKey = semanticReminderKey(caseId, reminderDayFromCount(request?.reminderCount ?? 1));
    }
    if (event.type === "case.escalated" && request?.executedEscalationActions?.includes("secondary_contact")) {
      semanticKey = semanticSecondaryContactKey(caseId);
    }
    if (!semanticKey) continue;
    const supplierActorId = request?.supplierId ?? state.cases.find((c) => c.id === caseId)?.currentActorId;
    if (!supplierActorId) continue;
    const row = await queueSupplierOutreach({
      store,
      organisationId,
      organisationName,
      state,
      supplierActorId,
      caseIds: [caseId],
      semanticKey,
      now,
    });
    if (row) rows.push(row);
  }
  return rows;
}

async function consumePortalLimits(args: {
  rateLimiter: RateLimiter;
  principal: Extract<AnyPrincipal, { kind: "supplier_portal" }>;
  commandType: string;
  clientIp?: string;
  tokenFingerprint?: string;
}) {
  const specs = portalRateLimitKeys({
    tokenFingerprint: args.tokenFingerprint,
    ip: args.clientIp,
    grantId: args.principal.grantId,
    commandType: args.commandType,
  });
  if (!specs.length) {
    specs.push({ key: `portal:grant:${args.principal.grantId}`, limit: 60, windowSeconds: 60 });
  }
  for (const spec of specs) {
    const result = await args.rateLimiter.consume(spec);
    if (!result.allowed) {
      metricInc(METRICS.portalRateLimited);
      logOperational("portal.rate_limited", { grantId: args.principal.grantId, commandType: args.commandType });
      throw new SourceError("RATE_LIMITED", "Too many portal attempts.", 429);
    }
  }
}

export async function resolveUserPrincipal(store: PersistencePort, userId: string, organisationId: string): Promise<Principal> {
  const user = await store.getUserById(userId);
  const membership = await store.getMembership(userId, organisationId);
  if (!user || !membership || membership.status === "SUSPENDED") {
    throw new SourceError("UNAUTHENTICATED", "Sign in required.", 401);
  }
  return {
    kind: "user",
    userId,
    organisationId,
    membershipId: membership.id,
    roles: [membership.role],
    capabilities: membership.capabilities.length ? membership.capabilities : ROLE_CAPABILITIES[membership.role],
    email: user.email,
    authenticationMethod: "TEST",
  };
}

export async function dispatchCommand(args: {
  store: PersistencePort;
  principal: AnyPrincipal;
  envelope: CommandEnvelope;
  now?: Date;
  rateLimiter?: RateLimiter;
  clientIp?: string;
  tokenFingerprint?: string;
  requireDurableEvidence?: boolean;
}): Promise<CommandOutcome> {
  const now = args.now ?? new Date();
  const { store, principal, envelope } = args;
  const rateLimiter = args.rateLimiter ?? getMemoryRateLimiter();

  try {
    if (principal.kind === "user") {
      if (envelope.organisationId !== principal.organisationId) {
        throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
      }
      authorizeUserCommand(principal, envelope.command);
    } else {
      await consumePortalLimits({
        rateLimiter,
        principal,
        commandType: envelope.command.type,
        clientIp: args.clientIp,
        tokenFingerprint: args.tokenFingerprint,
      });
      authorizePortalCommand(principal, envelope.command);
    }
  } catch (error) {
    if (error instanceof SourceError && (error.code === "FORBIDDEN" || error.code === "RESOURCE_UNAVAILABLE")) {
      metricInc(METRICS.authzDenied);
    }
    throw error;
  }

  try {
  return await store.transaction(async (tx) =>
    executeCommand({
      tx,
      principal,
      envelope,
      now,
      requireDurableEvidence: args.requireDurableEvidence,
    })
  );
  } catch (error) {
    if (error instanceof SourceError && error.code === "CASE_CHANGED") metricInc(METRICS.commandsCaseChanged);
    throw error;
  }
}

async function executeCommand(args: {
  tx: PersistencePort;
  principal: AnyPrincipal;
  envelope: CommandEnvelope;
  now: Date;
  requireDurableEvidence?: boolean;
}): Promise<CommandOutcome> {
  const { tx, principal, envelope, now } = args;
  const organisationId = principal.organisationId;
  const existing = await tx.findProcessedCommand(organisationId, envelope.idempotencyKey);
  if (existing) {
    metricInc(METRICS.commandsIdempotentReplay);
    if (existing.result.status === "error") return existing.result;
    return { ...existing.result, status: "ALREADY_PROCESSED" };
  }

  const state = await tx.loadEngine(organisationId);
  const caseId = caseIdOf(envelope.command);
  if (caseId) {
    const resolution = state.cases.find((item) => item.id === caseId);
    if (!resolution) throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
    if (envelope.expectedVersion !== undefined && resolution.version !== envelope.expectedVersion) {
      throw new SourceError("CASE_CHANGED", "This case changed while you were working. Refresh to continue.", 409);
    }
  }

  if (envelope.command.type === "SUBMIT_RESPONSE") {
    envelope.command = await bindSubmitResponseEvidence({
      store: tx,
      principal,
      command: envelope.command,
      requireDurable: args.requireDurableEvidence ?? durableEvidenceFromEnv(),
    });
  }

  const result = applyCommand(state, envelope.command, now);
  if (result.caseId) {
    const claim = result.state.claims.find((item) => item.caseId === result.caseId && item.ready);
    if (claim) propagateReadyClaim(result.state, claim.id, now);
  }

  await tx.saveEngine(organisationId, result.state);

  const outbox = await outboxForEvents({
    store: tx,
    organisationId,
    organisationName: result.state.tenant.name,
    state: result.state,
    events: result.events,
    caseId: result.caseId,
    now,
  });
  const sideEffects = outbox.map((row) => ({ type: row.eventType, key: row.semanticKey }));

  const outcome: CommandOutcome = {
    status: "ok",
    caseId: result.caseId,
    version: result.caseId ? result.state.cases.find((item) => item.id === result.caseId)?.version : undefined,
    events: result.events.map((event) => ({ type: event.type, detail: event.detail })),
    sideEffects,
  };

  await tx.saveProcessedCommand({
    id: envelope.commandId,
    idempotencyKey: envelope.idempotencyKey,
    organisationId,
    principalId: envelope.principalId,
    commandType: envelope.command.type,
    result: outcome,
    processedAt: now.toISOString(),
  });

  await tx.appendAudit(
    structuredCommandAudit({
      id: await Promise.resolve(tx.nextId("aud")),
      organisationId,
      principalId: envelope.principalId,
      action: envelope.command.type,
      caseId: result.caseId,
      commandId: envelope.commandId,
      result: "success",
      eventTypes: outcome.events.map((event) => event.type),
      createdAt: now.toISOString(),
    })
  );

  for (const row of outbox) await tx.insertOutbox(row);
  metricInc(METRICS.commandsProcessed);
  logOperational("command.processed", {
    organisationId,
    commandType: envelope.command.type,
    caseId: result.caseId,
    outbox: outbox.length,
  });
  return outcome;
}

export function assertReadinessInvariant(state: EngineState) {
  for (const claim of state.claims) {
    if (!claim.caseId) continue;
    const resolution = state.cases.find((item) => item.id === claim.caseId);
    if (!resolution) continue;
    const evaluated = caseReadiness(state, resolution.id).ready;
    if (claim.ready !== evaluated) {
      throw new Error(`Readiness invariant failed for ${claim.id}: stored=${claim.ready} evaluated=${evaluated}`);
    }
  }
}

function durableEvidenceFromEnv(): boolean {
  try {
    return durableEvidenceRequired();
  } catch {
    return false;
  }
}

async function bindSubmitResponseEvidence(args: {
  store: PersistencePort;
  principal: AnyPrincipal;
  command: Extract<Command, { type: "SUBMIT_RESPONSE" }>;
  requireDurable: boolean;
}): Promise<Extract<Command, { type: "SUBMIT_RESPONSE" }>> {
  const evidence = args.command.evidence;
  if (!evidence) return args.command;
  if (!evidence.storageObjectId) {
    if (args.requireDurable) {
      throw new SourceError("VALIDATION", "Upload a real evidence file. Filename-only submissions are not accepted.", 400);
    }
    return args.command;
  }
  const object = await args.store.getStorageObject(evidence.storageObjectId);
  if (!object || object.organisationId !== args.principal.organisationId || object.deletedAt) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
  if (object.purpose !== "EVIDENCE" || object.availability !== "AVAILABLE") {
    throw new SourceError("VALIDATION", "Evidence is not available yet.", 400);
  }
  if (args.principal.kind === "supplier_portal") {
    if (object.createdViaPortalGrantId !== args.principal.grantId) {
      throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
    }
    if (object.caseId && object.caseId !== args.command.caseId) {
      throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
    }
    if (object.caseId && !args.principal.allowedCaseIds.includes(object.caseId)) {
      throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
    }
  }
  return {
    ...args.command,
    evidence: {
      ...evidence,
      filename: object.originalFilename,
      sha256: object.sha256,
      mimeType: object.mimeType,
      sizeBytes: object.sizeBytes,
      storageObjectId: object.id,
      availability: "AVAILABLE",
    },
  };
}
