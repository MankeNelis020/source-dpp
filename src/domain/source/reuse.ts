import type { ClaimRecord, EvidenceRecord, InformationRequirement, PermissionGrant, ReuseOutcome } from "./types";
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

  if (!trustMeets(args.claim.trustLevel, args.requirement.requiredTrustLevel)) {
    if (args.permission?.visibility === "verification_only") return "VERIFICATION_ONLY_AVAILABLE";
    return "NONE";
  }

  const state = args.permission?.state ?? args.claim.permissionState;
  if (state === "UNKNOWN") return "PRIVATE";
  if (state === "DENIED" || state === "REVOKED") return "PRIVATE";
  if (state === "EXPIRED") return "EXPIRED";
  if (state === "REQUEST_REQUIRED" || state === "REQUESTED") return "AUTHORIZATION_REQUIRED";
  if (args.permission?.visibility === "verification_only") return "VERIFICATION_ONLY_AVAILABLE";
  if (state === "GRANTED" || state === "NOT_REQUIRED" || state === "RESTRICTED") return "READY";
  return "AUTHORIZATION_REQUIRED";
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
