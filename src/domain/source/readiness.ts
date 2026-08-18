import { evaluatePermission, permissionGatePass, type PermissionEvaluationInput } from "./permissions";
import type {
  ClaimRecord,
  EvidenceRecord,
  ExceptionCode,
  GateName,
  GateResult,
  PermissionDecision,
  PermissionGrant,
  PermissionState,
  Purpose,
  TrustLevel,
} from "./types";

export interface ReadinessInput {
  identity: { matched: boolean; confidence: number; autoLinkThreshold: number; ambiguous?: boolean };
  valuePresent: boolean;
  trustLevel?: TrustLevel;
  requiredTrustLevel: TrustLevel;
  evidence?: EvidenceRecord;
  evidenceRequired: boolean;
  scopeMatch: boolean;
  /** Preferred: already-evaluated decision. Stored RESTRICTED must not auto-pass. */
  permissionDecision?: PermissionDecision;
  permission?: PermissionState;
  permissionRequired: boolean;
  conflict: boolean;
  permissionContext?: Omit<PermissionEvaluationInput, "storedState" | "permissionRequired"> & {
    storedState?: PermissionState;
    requestingOrganisationId?: string;
    purpose?: Purpose;
  };
}

export interface ReadinessReport {
  gates: Record<GateName, GateResult>;
  ready: boolean;
  blockingReason?: ExceptionCode;
}

const TRUST_RANK: Record<TrustLevel, number> = {
  DECLARED: 1,
  EVIDENCED: 2,
  VERIFIED: 3,
  TRACEABLE: 4,
};

export function trustMeets(actual: TrustLevel | undefined, required: TrustLevel): boolean {
  if (!actual) return false;
  return TRUST_RANK[actual] >= TRUST_RANK[required];
}

function evidenceIsAvailable(evidence?: EvidenceRecord): boolean {
  if (!evidence) return false;
  return !evidence.availability || evidence.availability === "AVAILABLE";
}

function resolvePermissionDecision(input: ReadinessInput): PermissionDecision {
  if (input.permissionDecision) return input.permissionDecision;
  const stored = input.permission ?? input.permissionContext?.storedState ?? "UNKNOWN";
  return evaluatePermission({
    storedState: stored,
    visibility: input.permissionContext?.visibility,
    permissionRequired: input.permissionRequired,
    requestingOrganisationId: input.permissionContext?.requestingOrganisationId ?? "unknown",
    ownerOrganisationId: input.permissionContext?.ownerOrganisationId,
    granteeActorId: input.permissionContext?.granteeActorId,
    purpose: input.permissionContext?.purpose ?? "DPP_COMPLIANCE",
    grantPurpose: input.permissionContext?.grantPurpose,
    now: input.permissionContext?.now ?? new Date(0),
    validFrom: input.permissionContext?.validFrom,
    validUntil: input.permissionContext?.validUntil,
    revokedAt: input.permissionContext?.revokedAt,
  });
}

export function evaluateReadiness(input: ReadinessInput): ReadinessReport {
  const identityPass = input.identity.matched && !input.identity.ambiguous && input.identity.confidence >= input.identity.autoLinkThreshold;
  const valuePass = input.valuePresent;
  const evidencePresent = Boolean(input.evidence) && !input.evidence?.expired && evidenceIsAvailable(input.evidence);
  const evidencePass = input.evidenceRequired ? evidencePresent : true;
  const scopePass = !input.evidence || input.scopeMatch;
  const validityPass = !input.evidence || (!input.evidence.expired && Boolean(input.evidence.validUntil));
  const permissionDecision = resolvePermissionDecision(input);
  const permissionPassGate = !input.permissionRequired || permissionGatePass(permissionDecision);
  const conflictPass = !input.conflict;
  const trustPass = !input.evidenceRequired || trustMeets(input.trustLevel, input.requiredTrustLevel);

  const gates: Record<GateName, GateResult> = {
    identity: identityPass ? "pass" : "fail",
    value: valuePass ? "pass" : "fail",
    evidence: evidencePass && trustPass ? "pass" : "fail",
    scope: scopePass ? "pass" : "fail",
    validity: input.evidenceRequired ? (validityPass ? "pass" : "fail") : "pass",
    permission: permissionPassGate ? "pass" : "fail",
    conflict: conflictPass ? "pass" : "fail",
  };

  let blockingReason: ExceptionCode | undefined;
  if (gates.identity === "fail") blockingReason = input.identity.ambiguous ? "IDENTITY_AMBIGUOUS" : "IDENTITY_AMBIGUOUS";
  else if (gates.conflict === "fail") blockingReason = "EVIDENCE_CONFLICT";
  else if (gates.scope === "fail") blockingReason = "SCOPE_MISMATCH";
  else if (gates.validity === "fail") blockingReason = "EVIDENCE_EXPIRED";
  else if (gates.evidence === "fail") blockingReason = input.trustLevel === "DECLARED" ? "EVIDENCE_MISSING" : "EVIDENCE_MISSING";
  else if (gates.value === "fail") blockingReason = "EVIDENCE_MISSING";
  else if (gates.permission === "fail") {
    const stored = input.permission ?? input.permissionContext?.storedState;
    if (stored === "REVOKED") blockingReason = "PERMISSION_REVOKED";
    else if (stored === "DENIED" || permissionDecision === "DENY") blockingReason = "PERMISSION_DENIED";
    else blockingReason = "AUTHORIZATION_REQUIRED";
  }

  const ready = (Object.values(gates) as GateResult[]).every((g) => g === "pass");
  return { gates, ready, blockingReason: ready ? undefined : blockingReason };
}

export function readinessFromRecords(args: {
  identityConfidence: number;
  identityMatched: boolean;
  identityAmbiguous?: boolean;
  autoLinkThreshold: number;
  claim?: ClaimRecord;
  evidence?: EvidenceRecord;
  permission?: PermissionGrant;
  requiredTrustLevel: TrustLevel;
  conflict: boolean;
  scopeMatch: boolean;
}): ReadinessReport {
  const permissionState = args.permission?.state ?? args.claim?.permissionState ?? "UNKNOWN";
  return evaluateReadiness({
    identity: {
      matched: args.identityMatched,
      confidence: args.identityConfidence,
      autoLinkThreshold: args.autoLinkThreshold,
      ambiguous: args.identityAmbiguous,
    },
    valuePresent: Boolean(args.claim?.value),
    trustLevel: args.claim?.trustLevel,
    requiredTrustLevel: args.requiredTrustLevel,
    evidence: args.evidence,
    evidenceRequired: args.requiredTrustLevel !== "DECLARED",
    scopeMatch: args.scopeMatch,
    permission: permissionState,
    permissionRequired: true,
    conflict: args.conflict,
  });
}

export function mayAutoLinkEvidence(confidence: number, threshold: number, ambiguous: boolean): boolean {
  if (ambiguous) return false;
  return confidence >= threshold;
}
