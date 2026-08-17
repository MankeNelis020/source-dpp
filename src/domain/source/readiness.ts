import type {
  ClaimRecord,
  EvidenceRecord,
  ExceptionCode,
  GateName,
  GateResult,
  PermissionGrant,
  PermissionState,
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
  permission: PermissionState;
  permissionRequired: boolean;
  conflict: boolean;
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

function permissionPass(state: PermissionState, required: boolean): boolean {
  if (!required) return true;
  return state === "GRANTED" || state === "NOT_REQUIRED" || state === "RESTRICTED";
}

export function evaluateReadiness(input: ReadinessInput): ReadinessReport {
  const identityPass = input.identity.matched && !input.identity.ambiguous && input.identity.confidence >= input.identity.autoLinkThreshold;
  const valuePass = input.valuePresent;
  const evidencePresent = Boolean(input.evidence) && !input.evidence?.expired;
  const evidencePass = input.evidenceRequired ? evidencePresent : true;
  const scopePass = !input.evidence || input.scopeMatch;
  const validityPass = !input.evidence || (!input.evidence.expired && Boolean(input.evidence.validUntil));
  const permissionPassGate = permissionPass(input.permission, input.permissionRequired);
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
    if (input.permission === "REVOKED") blockingReason = "PERMISSION_REVOKED";
    else if (input.permission === "DENIED") blockingReason = "PERMISSION_DENIED";
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
