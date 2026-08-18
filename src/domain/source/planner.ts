import type { AttemptMethod } from "./types";
import { evaluateReuse } from "./reuse";
import type { ReuseOutcome } from "./types";
import type { ClaimRecord, EvidenceRecord, InformationRequirement, PermissionGrant, ResolutionCase } from "./types";

export interface ResolutionPlan {
  strategy:
    | "exact_trusted_claim"
    | "reusable_claim"
    | "authorization_only"
    | "cross_product_compatible"
    | "existing_evidence"
    | "internal_document_candidate"
    | "active_duplicate_case"
    | "supplier_request"
    | "alternative_contact"
    | "upstream_forward"
    | "human_review"
    | "explained_unresolved";
  reason: string;
  requiresHumanReview: boolean;
  expectedActions: AttemptMethod[];
  candidateClaimId?: string;
  candidateEvidenceId?: string;
  candidateActorId?: string;
  candidateCaseId?: string;
  reuse?: ReuseOutcome;
}

export interface PlannerInput {
  requirement: InformationRequirement;
  identityMatched: boolean;
  identityNeedsReview: boolean;
  declaredSupplierId?: string;
  claim?: ClaimRecord;
  evidence?: EvidenceRecord;
  permission?: PermissionGrant;
  duplicateCaseId?: string;
  crossProductClaim?: ClaimRecord;
  internalDocumentId?: string;
  hasValidContact: boolean;
  now: Date;
  openCases: ResolutionCase[];
}

/**
 * Deterministic resolution planner v1. SOURCE must not create new supplier work
 * when an existing permitted path with sufficient trust exists.
 */
export function planResolution(input: PlannerInput): ResolutionPlan {
  if (input.identityNeedsReview) {
    return {
      strategy: "human_review",
      reason: "We're not sure these are the same supplier.",
      requiresHumanReview: true,
      expectedActions: ["human_review"],
    };
  }

  if (input.duplicateCaseId) {
    return {
      strategy: "active_duplicate_case",
      reason: "An open case already covers this subject and property.",
      requiresHumanReview: false,
      expectedActions: ["reuse"],
      candidateCaseId: input.duplicateCaseId,
    };
  }

  const reuse = evaluateReuse({
    requirement: input.requirement,
    identityMatched: input.identityMatched,
    claim: input.claim,
    evidence: input.evidence,
    permission: input.permission,
    now: input.now,
  });

  if (reuse === "READY" && input.claim) {
    return {
      strategy: "exact_trusted_claim",
      reason: "Existing exact trusted claim can resolve this requirement.",
      requiresHumanReview: false,
      expectedActions: ["reuse"],
      candidateClaimId: input.claim.id,
      candidateEvidenceId: input.claim.evidenceId,
      reuse,
    };
  }

  if (reuse === "AUTHORIZATION_REQUIRED" && input.claim) {
    return {
      strategy: "authorization_only",
      reason: "We already found the information. The supplier only needs to allow its use for your company.",
      requiresHumanReview: false,
      expectedActions: ["authorization"],
      candidateClaimId: input.claim.id,
      reuse,
    };
  }

  if (reuse === "VERIFICATION_ONLY_AVAILABLE" && input.claim) {
    return {
      strategy: "reusable_claim",
      reason: "A verification-only result is available until full permission is granted.",
      requiresHumanReview: false,
      expectedActions: ["authorization"],
      candidateClaimId: input.claim.id,
      reuse,
    };
  }

  if (input.crossProductClaim) {
    return {
      strategy: "cross_product_compatible",
      reason: "A compatible claim on a related subject may be reusable after permission evaluation.",
      requiresHumanReview: true,
      expectedActions: ["reuse"],
      candidateClaimId: input.crossProductClaim.id,
      candidateEvidenceId: input.crossProductClaim.evidenceId,
    };
  }

  if (input.evidence && !input.evidence.expired) {
    return {
      strategy: "existing_evidence",
      reason: "Evidence already in SOURCE can be evaluated before asking a supplier.",
      requiresHumanReview: false,
      expectedActions: ["reuse"],
      candidateEvidenceId: input.evidence.id,
    };
  }

  if (input.internalDocumentId) {
    return {
      strategy: "internal_document_candidate",
      reason: "An internal document may already contain this information.",
      requiresHumanReview: true,
      expectedActions: ["ai_extraction", "human_review"],
      candidateEvidenceId: input.internalDocumentId,
    };
  }

  if (input.declaredSupplierId && input.hasValidContact) {
    return {
      strategy: "supplier_request",
      reason: "No permitted existing path. Ask the known supplier.",
      requiresHumanReview: false,
      expectedActions: ["email_request"],
      candidateActorId: input.declaredSupplierId,
    };
  }

  if (input.declaredSupplierId && !input.hasValidContact) {
    return {
      strategy: "alternative_contact",
      reason: "The known supplier has no working contact yet.",
      requiresHumanReview: true,
      expectedActions: ["secondary_contact"],
      candidateActorId: input.declaredSupplierId,
    };
  }

  return {
    strategy: "human_review",
    reason: "Confidence is too low to send. Review routing before creating supplier work.",
    requiresHumanReview: true,
    expectedActions: ["human_review"],
  };
}
