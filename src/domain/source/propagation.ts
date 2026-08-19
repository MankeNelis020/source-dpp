import { evaluatePermission } from "./permissions";
import { evaluateReadiness } from "./readiness";
import { trustMeets } from "./readiness";
import { recordContactAvoided, recordRequirementOutcome } from "./analytics";
import type {
  ClaimRecord,
  EngineState,
  EvidenceRecord,
  InformationRequirement,
  PermissionGrant,
  Purpose,
} from "./types";

export type PropagationResult =
  | "READY"
  | "AUTHORIZATION_REQUIRED"
  | "VERIFICATION_ONLY_AVAILABLE"
  | "NO_MATCH"
  | "PRIVATE"
  | "EXPIRED";

export interface PropagationEvent {
  type:
    | "claim.ready"
    | "resolution.propagation_started"
    | "resolution.candidate_found"
    | "resolution.reuse_allowed"
    | "resolution.authorization_required"
    | "requirement.resolved_by_reuse"
    | "resolution.propagation_completed";
  claimId: string;
  requirementId?: string;
  caseId?: string;
  decision: PropagationResult;
  explanation: string;
  policyVersion: string;
  actor: string;
  timestamp: string;
}

export function claimsCompatible(args: {
  claim: ClaimRecord;
  requirement: InformationRequirement;
  evidence?: EvidenceRecord;
  now: Date;
}): boolean {
  if (args.claim.subjectId !== args.requirement.subjectId) return false;
  if (args.claim.propertyId !== args.requirement.propertyId) return false;
  if (args.claim.purpose !== args.requirement.purpose && args.requirement.purpose === "INTERNAL") return false;
  if (!trustMeets(args.claim.trustLevel, args.requirement.requiredTrustLevel)) return false;
  const expired =
    args.evidence?.expired ||
    (args.claim.validUntil ? new Date(args.claim.validUntil) < args.now : false) ||
    (args.evidence?.validUntil ? new Date(args.evidence.validUntil) < args.now : false);
  return !expired;
}

export function evidenceScopeApplies(evidence: EvidenceRecord | undefined, subjectId: string): boolean {
  if (!evidence) return true;
  if (evidence.scope.kind === "company") return true;
  if (!evidence.scope.id) return false;
  return evidence.scope.id === subjectId;
}

export function evaluatePropagationCandidate(args: {
  claim: ClaimRecord;
  requirement: InformationRequirement;
  evidence?: EvidenceRecord;
  permission?: PermissionGrant;
  requestingOrganisationId: string;
  now: Date;
  identityMatched?: boolean;
  conflict?: boolean;
}): PropagationResult {
  if (args.claim.subjectId !== args.requirement.subjectId || args.claim.propertyId !== args.requirement.propertyId) {
    return "NO_MATCH";
  }
  if (args.identityMatched === false) return "NO_MATCH";
  if (args.conflict) return "NO_MATCH";
  const expired =
    args.evidence?.expired ||
    (args.claim.validUntil ? new Date(args.claim.validUntil) < args.now : false);
  if (expired) return "EXPIRED";
  if (!trustMeets(args.claim.trustLevel, args.requirement.requiredTrustLevel)) return "NO_MATCH";

  const decision = evaluatePermission({
    storedState: args.permission?.state ?? args.claim.permissionState,
    visibility: args.permission?.visibility,
    permissionRequired: args.requirement.requiredPermissionLevel === "granted",
    requestingOrganisationId: args.requestingOrganisationId,
    granteeActorId: args.permission?.granteeActorId,
    purpose: args.requirement.purpose,
    grantPurpose: args.permission?.purpose,
    now: args.now,
    validFrom: args.permission?.validFrom,
    validUntil: args.permission?.validUntil,
    revokedAt: args.permission?.revokedAt,
  });

  if (decision === "DENY") return "PRIVATE";
  if (decision === "AUTHORIZATION_REQUIRED") return "AUTHORIZATION_REQUIRED";
  if (args.permission && (args.permission.visibility === "verification_only" || args.permission.visibility === "VERIFICATION_ONLY")) {
    return "VERIFICATION_ONLY_AVAILABLE";
  }

  const scopeMatch = evidenceScopeApplies(args.evidence, args.requirement.subjectId);
  const report = evaluateReadiness({
    identity: { matched: args.identityMatched ?? true, confidence: args.claim.identityConfidence, autoLinkThreshold: 95 },
    valuePresent: Boolean(args.claim.value),
    trustLevel: args.claim.trustLevel,
    requiredTrustLevel: args.requirement.requiredTrustLevel,
    evidence: args.evidence,
    evidenceRequired: args.requirement.requiredTrustLevel !== "DECLARED",
    scopeMatch,
    permissionDecision: decision,
    permissionRequired: args.requirement.requiredPermissionLevel === "granted",
    conflict: Boolean(args.conflict),
  });
  return report.ready ? "READY" : "NO_MATCH";
}

/** Link eligible requirements to the same claim. Never copy the claim between tenants. */
export function propagateReadyClaim(
  state: EngineState,
  claimId: string,
  now: Date,
  actor = "SOURCE_SYSTEM"
): { state: EngineState; events: PropagationEvent[] } {
  const claim = state.claims.find((c) => c.id === claimId);
  const events: PropagationEvent[] = [];
  if (!claim || !claim.ready) return { state, events };

  const timestamp = now.toISOString();
  events.push({
    type: "resolution.propagation_started",
    claimId,
    decision: "READY",
    explanation: "Searching compatible unresolved requirements.",
    policyVersion: "propagation-v1",
    actor,
    timestamp,
  });

  const evidence = claim.evidenceId ? state.evidence.find((e) => e.id === claim.evidenceId) : undefined;
  const permission = state.permissions.find((p) => p.claimId === claim.id);

  for (const requirement of state.requirements) {
    if (requirement.resolvedAt) continue;
    if (requirement.id === claim.requirementId) continue;
    const resolution = state.cases.find((c) => c.id === requirement.linkedCaseId);
    const identityMatched = !resolution || resolution.identityStatus === "IDENTITY_MATCHED";
    const conflict = state.conflicts.some((c) => c.caseId === requirement.linkedCaseId && !c.resolved);
    const result = evaluatePropagationCandidate({
      claim,
      requirement,
      evidence,
      permission,
      requestingOrganisationId: state.tenant.id,
      now,
      identityMatched,
      conflict,
    });
    events.push({
      type: "resolution.candidate_found",
      claimId,
      requirementId: requirement.id,
      caseId: requirement.linkedCaseId,
      decision: result,
      explanation: tenantSafePropagationCopy(result),
      policyVersion: "propagation-v1",
      actor,
      timestamp,
    });
    if (result === "READY") {
      requirement.resolvedAt = timestamp;
      recordRequirementOutcome(state, {
        requirementId: requirement.id,
        mechanism: "SAME_TENANT_REUSE",
        claimId,
        evidenceId: evidence?.id,
        recordedAt: timestamp,
      });
      if (resolution?.state === "WAITING_RESPONSE" || resolution?.state === "REQUEST_PENDING" || resolution?.state === "ROUTING") {
        recordContactAvoided(state, {
          requirementId: requirement.id,
          caseId: resolution.id,
          supplierActorId: resolution.currentActorId,
          avoidedBy: "PROPAGATION",
          claimId,
          evidenceId: evidence?.id,
          timestamp,
        });
      }
      if (resolution && resolution.state !== "READY" && resolution.state !== "MONITORING") {
        resolution.state = "READY";
        resolution.resolutionOutcome = "READY";
        resolution.closedAt = timestamp;
        resolution.blockingReason = undefined;
        resolution.nextAction = "Resolved by reuse of an existing permitted claim.";
        resolution.version += 1;
      }
      events.push({
        type: "requirement.resolved_by_reuse",
        claimId,
        requirementId: requirement.id,
        caseId: requirement.linkedCaseId,
        decision: "READY",
        explanation: tenantSafePropagationCopy("READY"),
        policyVersion: "propagation-v1",
        actor,
        timestamp,
      });
    } else if (result === "AUTHORIZATION_REQUIRED") {
      const resolution = state.cases.find((c) => c.id === requirement.linkedCaseId);
      if (resolution && resolution.state !== "AUTHORIZATION_REQUIRED") {
        resolution.state = "AUTHORIZATION_REQUIRED";
        resolution.blockingReason = "AUTHORIZATION_REQUIRED";
        resolution.nextAction = "Ask the supplier for a one-click grant.";
        resolution.version += 1;
      }
      events.push({
        type: "resolution.authorization_required",
        claimId,
        requirementId: requirement.id,
        caseId: requirement.linkedCaseId,
        decision: "AUTHORIZATION_REQUIRED",
        explanation: tenantSafePropagationCopy("AUTHORIZATION_REQUIRED"),
        policyVersion: "propagation-v1",
        actor,
        timestamp,
      });
    }
  }

  events.push({
    type: "resolution.propagation_completed",
    claimId,
    decision: "READY",
    explanation: "Propagation finished.",
    policyVersion: "propagation-v1",
    actor,
    timestamp,
  });
  return { state, events };
}

export function tenantSafePropagationCopy(result: PropagationResult): string {
  if (result === "READY") return "Existing compatible evidence found.";
  if (result === "AUTHORIZATION_REQUIRED") {
    return "We already found the information. The supplier only needs to allow its use for your company.";
  }
  if (result === "VERIFICATION_ONLY_AVAILABLE") return "Verification-only result available.";
  if (result === "EXPIRED") return "Compatible evidence has expired.";
  if (result === "PRIVATE") return "Existing information is not available to your organisation.";
  return "No compatible permitted claim.";
}

export function purposeAllowsReuse(from: Purpose, to: Purpose): boolean {
  return from === to || from === "DPP_COMPLIANCE";
}
