import type { ClaimRecord, EvidenceRecord, InformationRequirement, PermissionGrant, ReuseOutcome } from "./types";
import { evaluatePermission } from "./permissions";
import { trustMeets } from "./readiness";

export function evaluateReuse(args: {
  requirement: Pick<InformationRequirement, "subjectId" | "propertyId" | "requiredTrustLevel" | "purpose">;
  identityMatched: boolean;
  claim?: ClaimRecord;
  evidence?: EvidenceRecord;
  permission?: PermissionGrant;
  now: Date;
}): ReuseOutcome {
  if (!args.identityMatched || !args.claim) return "NONE";
  if (args.claim.subjectId !== args.requirement.subjectId) return "NONE";
  if (args.claim.propertyId !== args.requirement.propertyId) return "NONE";

  const expired =
    args.evidence?.expired ||
    (args.claim.validUntil ? new Date(args.claim.validUntil) < args.now : false) ||
    (args.evidence?.validUntil ? new Date(args.evidence.validUntil) < args.now : false);
  if (expired) return "EXPIRED";

  // Same-subject use is the original authorised application, not a new reuse.
  // Cross-product discovery uses effectiveReusePolicy() / discoverReusableEvidence().
  if (args.evidence?.reusePolicy === "NO_REUSE") return "NONE";

  if (!trustMeets(args.claim.trustLevel, args.requirement.requiredTrustLevel)) {
    if (args.permission?.visibility === "verification_only") return "VERIFICATION_ONLY_AVAILABLE";
    return "NONE";
  }

  const stored = args.permission?.state ?? args.claim.permissionState;
  if (args.permission?.visibility === "verification_only" || args.permission?.visibility === "VERIFICATION_ONLY") {
    if (stored === "GRANTED" || stored === "NOT_REQUIRED") return "VERIFICATION_ONLY_AVAILABLE";
  }
  const decision = evaluatePermission({
    storedState: stored,
    visibility: args.permission?.visibility,
    permissionRequired: true,
    requestingOrganisationId: args.permission?.granteeActorId ?? args.claim.declaredByActorId,
    granteeActorId: args.permission?.granteeActorId,
    purpose: args.requirement.purpose,
    grantPurpose: args.permission?.purpose,
    now: args.now,
    validFrom: args.permission?.validFrom,
    validUntil: args.permission?.validUntil,
    revokedAt: args.permission?.revokedAt,
  });
  if (decision === "DENY") return stored === "EXPIRED" ? "EXPIRED" : "PRIVATE";
  if (decision === "AUTHORIZATION_REQUIRED") {
    if (stored === "UNKNOWN" || stored === "DENIED" || stored === "REVOKED") return "PRIVATE";
    return "AUTHORIZATION_REQUIRED";
  }
  return "READY";
}

export function findActiveDuplicate(args: {
  requirements: InformationRequirement[];
  subjectId: string;
  propertyId: string;
  actorId?: string;
  cases: { id: string; requirementId: string; supplierId?: string; state: string }[];
}): { requirementId: string; caseId: string } | undefined {
  const openStates = new Set([
    "DETECTED",
    "RESOLVING_IDENTITY",
    "SEARCHING_EXISTING_DATA",
    "ROUTING",
    "REQUEST_PENDING",
    "WAITING_RESPONSE",
    "RESPONSE_RECEIVED",
    "VALIDATING",
    "EVIDENCE_REQUIRED",
    "PERMISSION_CHECK",
    "IDENTITY_REVIEW",
    "REVIEW_ROUTING",
    "CONTACT_REQUIRED",
    "WAITING_UPSTREAM",
    "AUTHORIZATION_REQUIRED",
    "CONFLICT",
    "RENEWAL_REQUIRED",
    "NDA_REQUIRED",
  ]);
  for (const requirement of args.requirements) {
    if (requirement.subjectId !== args.subjectId || requirement.propertyId !== args.propertyId) continue;
    const open = args.cases.find(
      (c) =>
        c.requirementId === requirement.id &&
        openStates.has(c.state) &&
        (!args.actorId || !c.supplierId || c.supplierId === args.actorId)
    );
    if (open) return { requirementId: requirement.id, caseId: open.id };
  }
  return undefined;
}
