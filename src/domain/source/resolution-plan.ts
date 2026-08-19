import type { EngineState, InformationRequirement, ResolutionCase, ResolutionCaseState } from "./types";

/** Disposition of one still-missing requirement. Names match SOURCE resolution semantics. */
export type ResolutionPlanBucket = "automatic" | "supplier_action" | "user_action" | "review_or_blocked";

const RESOLVED_STATES: ResolutionCaseState[] = ["READY", "RETURNED", "MONITORING"];

const AUTOMATIC_ROUTES = new Set([
  "exact_trusted_claim",
  "reusable_claim",
  "existing_evidence",
  "active_duplicate_case",
  "authorization_only",
]);

const SUPPLIER_ROUTES = new Set(["supplier_request", "upstream_forward"]);

const USER_ROUTES = new Set(["alternative_contact"]);

export interface ResolutionPlanSummary {
  /** Unresolved requirements — counted independently of the buckets. */
  missing: number;
  automatic: number;
  supplierAction: number;
  userAction: number;
  reviewOrBlocked: number;
  unclassified: string[];
}

export function isResolvedRequirement(requirement: InformationRequirement, resolution?: ResolutionCase): boolean {
  if (requirement.resolvedAt) return true;
  if (resolution && RESOLVED_STATES.includes(resolution.state)) return true;
  if (resolution?.resolutionOutcome === "READY") return true;
  return false;
}

/**
 * Every missing requirement must land in exactly one bucket.
 * Unknown supplier is user action, not "no action".
 */
export function classifyMissingRequirement(requirement: InformationRequirement, resolution?: ResolutionCase): ResolutionPlanBucket {
  const route = requirement.selectedRoute;
  const state = resolution?.state;
  const knownSupplier = Boolean(resolution?.supplierId || resolution?.currentActorId || requirement.selectedRoute === "supplier_request");

  if (state === "CONFLICT" || state === "IDENTITY_REVIEW" || state === "NDA_REQUIRED" || state === "PERMISSION_CHECK") {
    return "review_or_blocked";
  }
  if (state === "UNRESOLVED" || route === "explained_unresolved") return "review_or_blocked";
  if (route === "cross_product_compatible" || route === "internal_document_candidate") return "review_or_blocked";

  if (route && AUTOMATIC_ROUTES.has(route)) return "automatic";
  if (state === "AUTHORIZATION_REQUIRED" || state === "VALIDATING") return "automatic";

  if (route && SUPPLIER_ROUTES.has(route)) return "supplier_action";
  if (
    state === "WAITING_RESPONSE" ||
    state === "REQUEST_PENDING" ||
    state === "WAITING_UPSTREAM" ||
    state === "ROUTING" ||
    state === "EVIDENCE_REQUIRED" ||
    state === "RENEWAL_REQUIRED" ||
    state === "RESPONSE_RECEIVED"
  ) {
    return "supplier_action";
  }
  if ((state === "DETECTED" || state === "SEARCHING_EXISTING_DATA" || state === "RESOLVING_IDENTITY") && knownSupplier) {
    return "supplier_action";
  }

  if (route && USER_ROUTES.has(route)) return "user_action";
  if (state === "CONTACT_REQUIRED") return "user_action";
  if (route === "human_review" && !knownSupplier) return "user_action";
  if (state === "REVIEW_ROUTING" && !knownSupplier) return "user_action";
  if (state === "REVIEW_ROUTING") return "user_action";
  if ((state === "DETECTED" || state === "SEARCHING_EXISTING_DATA" || state === "RESOLVING_IDENTITY") && !knownSupplier) {
    return "user_action";
  }

  if (route === "human_review") return "review_or_blocked";

  // Never drop a missing requirement: surface it as something the user must handle.
  return "user_action";
}

export function caseForRequirement(state: EngineState, requirement: InformationRequirement): ResolutionCase | undefined {
  return state.cases.find((c) => c.id === requirement.linkedCaseId || c.requirementId === requirement.id);
}

export function summarizeMissingRequirements(state: EngineState): ResolutionPlanSummary {
  const missingRequirements = state.requirements.filter((requirement) => !isResolvedRequirement(requirement, caseForRequirement(state, requirement)));
  const counts: Record<ResolutionPlanBucket, number> = {
    automatic: 0,
    supplier_action: 0,
    user_action: 0,
    review_or_blocked: 0,
  };
  const unclassified: string[] = [];
  for (const requirement of missingRequirements) {
    const resolution = caseForRequirement(state, requirement);
    if (!resolution && !requirement.selectedRoute) {
      unclassified.push(requirement.id);
      counts.user_action += 1;
      continue;
    }
    const bucket = classifyMissingRequirement(requirement, resolution);
    counts[bucket] += 1;
  }
  return {
    missing: missingRequirements.length,
    automatic: counts.automatic,
    supplierAction: counts.supplier_action,
    userAction: counts.user_action,
    reviewOrBlocked: counts.review_or_blocked,
    unclassified,
  };
}

export function resolutionPlanInvariantHolds(summary: ResolutionPlanSummary): boolean {
  const summed = summary.automatic + summary.supplierAction + summary.userAction + summary.reviewOrBlocked;
  return summary.unclassified.length === 0 && summed === summary.missing;
}

export function assertResolutionPlanComplete(summary: ResolutionPlanSummary) {
  const summed = summary.automatic + summary.supplierAction + summary.userAction + summary.reviewOrBlocked;
  if (summary.unclassified.length > 0 || summed !== summary.missing) {
    throw new Error(
      `Resolution plan is incomplete: missing=${summary.missing} automatic=${summary.automatic} supplier=${summary.supplierAction} user=${summary.userAction} review=${summary.reviewOrBlocked} unclassified=${summary.unclassified.length}`
    );
  }
}

export function sourceHasExecutablePlan(summary: ResolutionPlanSummary): boolean {
  return summary.automatic + summary.supplierAction > 0;
}
