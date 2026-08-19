import { trustMeets } from "./readiness";
import type {
  DisclosureMode,
  EvidenceIssuerClass,
  EvidenceRecord,
  EvidenceReusePolicy,
  EvidenceRoute,
  InformationRequirement,
  LegacyVisibility,
  Purpose,
  RequirementAssessmentResult,
  ResolutionCaseState,
  TrustLevel,
  VisibilityPolicy,
} from "./types";

/** Existing SOURCE trust levels, labelled for manufacturer UX. Do not invent a parallel model. */
export const TRUST_STRENGTH_LABEL: Record<TrustLevel, string> = {
  DECLARED: "Asserted",
  EVIDENCED: "Documented",
  VERIFIED: "Verified",
  TRACEABLE: "Authoritative",
};

export const DISCLOSURE_MODE_LABEL: Record<DisclosureMode, string> = {
  SHARE_SOURCE: "Source file may be shared with the requesting organisation",
  PROTECTED_SOURCE: "Protected source — original stays confidential",
  VERIFICATION_ONLY: "Verification only — no confidential content shared",
  CANNOT_DISCLOSE: "Cannot disclose",
};

export const EVIDENCE_ROUTE_LABEL: Record<EvidenceRoute, string> = {
  ORIGINAL_DOCUMENT: "Original supporting evidence",
  ALTERNATIVE_DOCUMENT: "Alternative evidence",
  SUPPLIER_ATTESTATION: "Authorised declaration",
  CANNOT_PROVIDE: "Cannot provide or disclose",
};

export const PURPOSE_LABEL: Record<Purpose, string> = {
  DPP_COMPLIANCE: "Digital Product Passport evidence",
  CUSTOMER_REQUEST: "Customer request",
  INTERNAL: "Internal",
};

export function classifyEvidenceStrength(input: {
  route?: EvidenceRoute;
  hasFile: boolean;
  issuerClass?: EvidenceIssuerClass;
  relevant?: boolean;
  malformed?: boolean;
}): { trustLevel: TrustLevel; reason: string } {
  if (input.route === "CANNOT_PROVIDE") {
    return { trustLevel: "DECLARED", reason: "No evidence was supplied." };
  }
  if (input.route === "SUPPLIER_ATTESTATION" || (!input.hasFile && input.route !== "ORIGINAL_DOCUMENT" && input.route !== "ALTERNATIVE_DOCUMENT")) {
    return {
      trustLevel: "DECLARED",
      reason: "A responsible party has stated the fact, but no independent or source documentary support has been assessed.",
    };
  }
  if (input.malformed || !input.hasFile) {
    return {
      trustLevel: "DECLARED",
      reason: "A file was named, but SOURCE could not treat it as usable documentary evidence.",
    };
  }
  if (input.relevant === false) {
    return {
      trustLevel: "DECLARED",
      reason: "Documentary material exists but is not relevant to this requirement.",
    };
  }
  if (input.issuerClass === "competent_authority" || input.issuerClass === "official_registry") {
    return {
      trustLevel: "TRACEABLE",
      reason: "Evidence is from an official registry or competent authority.",
    };
  }
  if (
    input.issuerClass === "third_party" ||
    input.issuerClass === "laboratory" ||
    input.issuerClass === "accredited_certifier"
  ) {
    return {
      trustLevel: "VERIFIED",
      reason: "Independent or accredited documentary evidence supports the claim.",
    };
  }
  return {
    trustLevel: "EVIDENCED",
    reason: "SOURCE has source documentary evidence. Authority or independence may still be limited.",
  };
}

export function assessRequirementSufficiency(input: {
  caseState: ResolutionCaseState;
  claimReady: boolean;
  trustLevel?: TrustLevel;
  requiredTrustLevel: TrustLevel;
  conflict: boolean;
  reviewRequired: boolean;
  route?: EvidenceRoute;
}): { result: RequirementAssessmentResult; reason: string } {
  if (input.conflict || input.caseState === "CONFLICT") {
    return { result: "CONFLICTING", reason: "Valid evidence sources disagree. SOURCE will not pick a winner." };
  }
  if (input.reviewRequired || input.caseState === "VALIDATING" || input.caseState === "IDENTITY_REVIEW") {
    return {
      result: "REVIEW_REQUIRED",
      reason: "SOURCE needs a human to confirm whether this evidence supports the requirement.",
    };
  }
  if (input.route === "CANNOT_PROVIDE") {
    return {
      result: "INSUFFICIENT",
      reason: "The supplier could not provide evidence. The requirement stays open.",
    };
  }
  if (input.route === "SUPPLIER_ATTESTATION" && !trustMeets(input.trustLevel, input.requiredTrustLevel)) {
    return {
      result: "INSUFFICIENT",
      reason: "Attestation received, but documentary evidence is still required.",
    };
  }
  if (input.claimReady && trustMeets(input.trustLevel, input.requiredTrustLevel)) {
    return {
      result: "SUFFICIENT",
      reason: "This evidence sufficiently supports the requirement under the current policy.",
    };
  }
  return {
    result: "INSUFFICIENT",
    reason: "Evidence does not yet sufficiently support this requirement.",
  };
}

export function mapDisclosureModeToEvidenceVisibility(mode?: DisclosureMode): "private" | "protected" {
  if (mode === "SHARE_SOURCE") return "private";
  return "protected";
}

export function mapDisclosureModeToPermissionVisibility(
  mode?: DisclosureMode
): VisibilityPolicy | LegacyVisibility {
  if (mode === "VERIFICATION_ONLY") return "VERIFICATION_ONLY";
  if (mode === "PROTECTED_SOURCE") return "VALUE_ONLY";
  if (mode === "SHARE_SOURCE") return "CUSTOMER_ONLY";
  return "EVIDENCE_HIDDEN";
}

/**
 * Legacy evidence without disclosureMode fails closed for source access:
 * protected stays protected; missing mode is treated as protected;
 * existing private files keep SHARE_SOURCE (authorised manufacturer read), never public.
 */
export function effectiveDisclosureMode(
  evidence: Pick<EvidenceRecord, "disclosureMode" | "visibility">
): DisclosureMode {
  if (evidence.disclosureMode) return evidence.disclosureMode;
  if (evidence.visibility === "private") return "SHARE_SOURCE";
  if (evidence.visibility === "public") return "SHARE_SOURCE";
  return "PROTECTED_SOURCE";
}

export function reuseRank(policy: EvidenceReusePolicy | undefined): number {
  if (policy === "BROADER_REUSE") return 3;
  if (policy === "REUSE_WITHIN_REQUESTING_ORGANISATION") return 2;
  if (policy === "ASK_FOR_REUSE") return 1;
  return 0;
}

export function isSupportedReusePolicy(policy: string | undefined): policy is EvidenceReusePolicy {
  return (
    policy === "NO_REUSE" ||
    policy === "ASK_FOR_REUSE" ||
    policy === "REUSE_WITHIN_REQUESTING_ORGANISATION" ||
    policy === "BROADER_REUSE"
  );
}

/**
 * Default reuse choice for new supplier submissions.
 *
 * Portal UX preselects ASK_FOR_REUSE. Terms acceptance from the portal uses
 * REUSE_WITHIN_REQUESTING_ORGANISATION as a ceiling so the supplier can still
 * choose Ask / same organisation / Do not reuse. BROADER_REUSE is never the
 * default. Unspecified historical acceptances stay NO_REUSE (fail closed).
 */
export function defaultEvidenceReusePolicy(accepted?: EvidenceReusePolicy): EvidenceReusePolicy {
  const preferred: EvidenceReusePolicy = "ASK_FOR_REUSE";
  if (!accepted) return preferred;
  return reuseRank(preferred) > reuseRank(accepted) ? accepted : preferred;
}

export function defaultAcceptedEvidenceRoutes(
  requirement: Pick<
    InformationRequirement,
    "acceptedEvidenceRoutes" | "conditionallyAcceptedEvidenceRoutes" | "preferredEvidenceRoutes"
  >
): { preferred: EvidenceRoute[]; accepted: EvidenceRoute[]; conditional: EvidenceRoute[] } {
  return {
    preferred: requirement.preferredEvidenceRoutes ?? ["ORIGINAL_DOCUMENT"],
    accepted: requirement.acceptedEvidenceRoutes ?? ["ORIGINAL_DOCUMENT", "ALTERNATIVE_DOCUMENT"],
    conditional: requirement.conditionallyAcceptedEvidenceRoutes ?? ["SUPPLIER_ATTESTATION"],
  };
}

export function documentaryRoute(route?: EvidenceRoute): boolean {
  return route === "ORIGINAL_DOCUMENT" || route === "ALTERNATIVE_DOCUMENT";
}
