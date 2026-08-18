import type {
  ContactAvoidedBy,
  EngineState,
  PilotRun,
  PilotSnapshot,
  ResolutionCaseState,
  ResolutionMechanism,
  RequirementOutcome,
} from "./types";

const RESOLVED_STATES: ResolutionCaseState[] = ["READY", "RETURNED", "MONITORING"];
const HUMAN_MECHANISMS: ResolutionMechanism[] = ["HUMAN_ENTRY"];
const OUTREACH_MECHANISMS: ResolutionMechanism[] = ["SUPPLIER_RESPONSE", "UPSTREAM_RESPONSE"];

export function capturePilotSnapshot(state: EngineState, now: Date): PilotSnapshot {
  const products = state.subjects.filter((s) => s.kind === "PRODUCT" || s.kind === "VARIANT");
  const suppliers = state.actors.filter((a) => a.kind === "organisation" && a.id !== state.tenant.id);
  const missingIds = state.requirements.filter((r) => !r.resolvedAt).map((r) => r.id);
  const readyIds = state.requirements.filter((r) => Boolean(r.resolvedAt)).map((r) => r.id);
  const casesByReq = new Map(state.cases.map((c) => [c.requirementId, c]));
  let conflicted = 0;
  let identityUncertain = 0;
  let evidenceMissing = 0;
  let permissionBlocked = 0;
  for (const requirement of state.requirements) {
    const resolution = casesByReq.get(requirement.id);
    if (!resolution || RESOLVED_STATES.includes(resolution.state)) continue;
    if (resolution.state === "CONFLICT" || resolution.blockingReason === "EVIDENCE_CONFLICT") conflicted += 1;
    if (resolution.state === "IDENTITY_REVIEW" || resolution.blockingReason === "IDENTITY_AMBIGUOUS") identityUncertain += 1;
    if (resolution.blockingReason === "EVIDENCE_MISSING" || resolution.state === "EVIDENCE_REQUIRED") evidenceMissing += 1;
    if (
      resolution.state === "AUTHORIZATION_REQUIRED" ||
      resolution.blockingReason === "AUTHORIZATION_REQUIRED" ||
      resolution.blockingReason === "PERMISSION_DENIED"
    ) {
      permissionBlocked += 1;
    }
  }
  return {
    capturedAt: now.toISOString(),
    totalProducts: products.length,
    totalSubjects: state.subjects.length,
    totalSuppliers: suppliers.length,
    totalRequirements: state.requirements.length,
    alreadyReady: readyIds.length,
    missing: missingIds.length,
    conflicted,
    identityUncertain,
    evidenceMissing,
    permissionBlocked,
    requirementIds: state.requirements.map((r) => r.id),
    missingRequirementIds: missingIds,
  };
}

export function recordRequirementOutcome(
  state: EngineState,
  outcome: RequirementOutcome
): RequirementOutcome {
  const existing = state.requirementOutcomes.find((row) => row.requirementId === outcome.requirementId);
  if (existing) {
    Object.assign(existing, outcome);
    return existing;
  }
  state.requirementOutcomes.push(outcome);
  const requirement = state.requirements.find((r) => r.id === outcome.requirementId);
  if (requirement) {
    requirement.resolutionMechanism = outcome.mechanism;
    requirement.resolvedByClaimId = outcome.claimId;
  }
  return outcome;
}

export function recordContactAvoided(
  state: EngineState,
  row: {
    requirementId: string;
    caseId?: string;
    supplierActorId?: string;
    avoidedBy: ContactAvoidedBy;
    claimId?: string;
    evidenceId?: string;
    timestamp: string;
  }
) {
  const id = `avoid-${state.seq}`;
  state.seq += 1;
  const saved = { id, ...row };
  state.contactAvoidances.push(saved);
  return saved;
}

export interface PilotEvaluation {
  catalogueSize: number;
  supplierCount: number;
  bomRelationships: number;
  requirementsGenerated: number;
  initialReadiness: number;
  initialMissing: number;
  resolvedWithoutOutreach: number;
  resolvedExistingEvidence: number;
  resolvedSameTenant: number;
  resolvedCrossTenant: number;
  resolvedAuthorization: number;
  resolvedSupplierResponse: number;
  resolvedUpstream: number;
  resolvedHuman: number;
  stillResolving: number;
  unresolved: number;
  uniqueSuppliersContacted: number;
  supplierContactsAvoided: number;
  humanReviewActions: number;
  productsUnblocked: number;
  resolutionLeverage: number;
  propagationMultiplier: number;
  autonomousResolutionRate: number;
  contactAvoidanceRate: number;
  evidenceReuseRate: number;
  humanReviewLoadPerThousand: number;
  outreachLoadPerThousand: number;
  naiveManualActions: number;
  groupedManualActions: number;
  timeToResolutionMs: number[];
  byMechanism: Record<string, number>;
}

function mechanismOf(run: PilotRun, state: EngineState, requirementId: string): ResolutionMechanism | undefined {
  return (
    state.requirementOutcomes.find((row) => row.requirementId === requirementId)?.mechanism ??
    state.requirements.find((r) => r.id === requirementId)?.resolutionMechanism
  );
}

export function evaluatePilotRun(state: EngineState, run: PilotRun): PilotEvaluation {
  const cohort = new Set(run.baseline.missingRequirementIds);
  const byMechanism: Record<string, number> = {};
  let resolvedWithoutOutreach = 0;
  let resolvedExistingEvidence = 0;
  let resolvedSameTenant = 0;
  let resolvedCrossTenant = 0;
  let resolvedAuthorization = 0;
  let resolvedSupplierResponse = 0;
  let resolvedUpstream = 0;
  let resolvedHuman = 0;
  const times: number[] = [];
  const started = Date.parse(run.executionStartedAt ?? run.startedAt);

  for (const id of cohort) {
    const requirement = state.requirements.find((r) => r.id === id);
    const mechanism = mechanismOf(run, state, id);
    if (!requirement?.resolvedAt || !mechanism) continue;
    byMechanism[mechanism] = (byMechanism[mechanism] ?? 0) + 1;
    if (!OUTREACH_MECHANISMS.includes(mechanism) && !HUMAN_MECHANISMS.includes(mechanism)) {
      resolvedWithoutOutreach += 1;
    }
    if (mechanism === "EXISTING_CLAIM" || mechanism === "EVIDENCE_EXTRACTION" || mechanism === "NORMALIZED_EXISTING_DATA") {
      resolvedExistingEvidence += 1;
    }
    if (mechanism === "SAME_TENANT_REUSE") resolvedSameTenant += 1;
    if (mechanism === "CROSS_TENANT_REUSE") resolvedCrossTenant += 1;
    if (mechanism === "AUTHORIZATION") resolvedAuthorization += 1;
    if (mechanism === "SUPPLIER_RESPONSE") resolvedSupplierResponse += 1;
    if (mechanism === "UPSTREAM_RESPONSE") resolvedUpstream += 1;
    if (mechanism === "HUMAN_ENTRY") resolvedHuman += 1;
    times.push(Date.parse(requirement.resolvedAt) - started);
  }

  const stillResolving = [...cohort].filter((id) => {
    const requirement = state.requirements.find((r) => r.id === id);
    const resolution = state.cases.find((c) => c.requirementId === id);
    return requirement && !requirement.resolvedAt && resolution && resolution.state !== "UNRESOLVED";
  }).length;
  const unresolved = [...cohort].filter((id) => {
    const resolution = state.cases.find((c) => c.requirementId === id);
    return resolution?.state === "UNRESOLVED";
  }).length;

  const resolvedCount =
    resolvedWithoutOutreach + resolvedSupplierResponse + resolvedUpstream + resolvedHuman;
  const humanActions = state.identityDecisions.filter((d) => Date.parse(d.createdAt) >= started).length +
    state.tasks.filter((t) => t.status === "done" && Date.parse(t.createdAt) >= started).length;
  const uniqueSuppliers = new Set(
    state.requests
      .filter((r) => Date.parse(r.sentAt ?? run.executionStartedAt ?? run.startedAt) >= started)
      .map((r) => r.supplierId)
  );
  const newClaims = state.claims.filter((c) => c.ready && (c.requirementId ? cohort.has(c.requirementId) : true));
  const propagated = resolvedSameTenant;
  const denom = Math.max(1, run.baseline.missingRequirementIds.length);
  const reqDenom = Math.max(1, run.baseline.totalRequirements) / 1000;

  const baselineBlockedProducts = new Set(
    state.requirements
      .filter((r) => run.baseline.missingRequirementIds.includes(r.id))
      .flatMap((r) => r.productIds)
  );
  const stillBlocked = new Set(
    state.requirements.filter((r) => !r.resolvedAt).flatMap((r) => r.productIds)
  );
  const productsUnblocked = [...baselineBlockedProducts].filter((id) => !stillBlocked.has(id)).length;

  const naive = run.baseline.missingRequirementIds.length;
  const groupedKeys = new Set(
    run.baseline.missingRequirementIds.map((id) => {
      const requirement = state.requirements.find((r) => r.id === id);
      const resolution = state.cases.find((c) => c.requirementId === id);
      return `${resolution?.supplierId ?? "unknown"}:${requirement?.propertyId ?? "unknown"}`;
    })
  );

  return {
    catalogueSize: run.baseline.totalProducts,
    supplierCount: run.baseline.totalSuppliers,
    bomRelationships: state.subjectRelationships.length,
    requirementsGenerated: run.baseline.totalRequirements,
    initialReadiness: run.baseline.alreadyReady,
    initialMissing: run.baseline.missing,
    resolvedWithoutOutreach,
    resolvedExistingEvidence,
    resolvedSameTenant,
    resolvedCrossTenant,
    resolvedAuthorization,
    resolvedSupplierResponse,
    resolvedUpstream,
    resolvedHuman,
    stillResolving,
    unresolved,
    uniqueSuppliersContacted: uniqueSuppliers.size,
    supplierContactsAvoided: state.contactAvoidances.filter((row) => cohort.has(row.requirementId)).length,
    humanReviewActions: humanActions,
    productsUnblocked,
    resolutionLeverage: humanActions + uniqueSuppliers.size === 0 ? resolvedCount : resolvedCount / Math.max(1, humanActions + uniqueSuppliers.size),
    propagationMultiplier: newClaims.length ? propagated / newClaims.length : propagated,
    autonomousResolutionRate: resolvedCount ? (resolvedCount - resolvedHuman) / resolvedCount : 0,
    contactAvoidanceRate: resolvedWithoutOutreach / denom,
    evidenceReuseRate: resolvedCount ? resolvedExistingEvidence / resolvedCount : 0,
    humanReviewLoadPerThousand: humanActions / Math.max(reqDenom, 0.001),
    outreachLoadPerThousand: uniqueSuppliers.size / Math.max(reqDenom, 0.001),
    naiveManualActions: naive,
    groupedManualActions: groupedKeys.size,
    timeToResolutionMs: times,
    byMechanism,
  };
}

export function humanPilotSentences(evaluation: PilotEvaluation): string[] {
  return [
    `SOURCE found ${evaluation.resolvedWithoutOutreach} answers before contacting a supplier.`,
    `${evaluation.supplierContactsAvoided} supplier requests were replaced by existing permitted evidence or reuse.`,
    `One resolution path unlocked ${evaluation.resolvedSameTenant} requirements through same-tenant propagation.`,
  ];
}
