import type {
  Actor,
  CaseFilter,
  EngineState,
  ResolutionCase,
  ResolutionCaseState,
} from "./types";
import { visibleActorName } from "./cycles";
import { caseReadiness } from "./engine";

const WAITING_SUPPLIER: ResolutionCaseState[] = ["WAITING_RESPONSE", "REQUEST_PENDING"];
const NEEDS_SUPPLIER: ResolutionCaseState[] = [
  "ROUTING",
  "REVIEW_ROUTING",
  "CONTACT_REQUIRED",
  "REQUEST_PENDING",
];
const NEEDS_AUTH: ResolutionCaseState[] = ["AUTHORIZATION_REQUIRED", "PERMISSION_CHECK"];
const NEEDS_REVIEW: ResolutionCaseState[] = ["IDENTITY_REVIEW", "VALIDATING"];
const RESOLVED: ResolutionCaseState[] = ["READY", "RETURNED", "MONITORING"];

export function matchesFilter(resolution: ResolutionCase, filter: CaseFilter): boolean {
  if (filter === "all") return true;
  if (filter === "waiting_supplier") return WAITING_SUPPLIER.includes(resolution.state);
  if (filter === "needs_supplier") return NEEDS_SUPPLIER.includes(resolution.state);
  if (filter === "waiting_upstream") return resolution.state === "WAITING_UPSTREAM";
  if (filter === "needs_authorization") return NEEDS_AUTH.includes(resolution.state);
  if (filter === "conflict") return resolution.state === "CONFLICT";
  if (filter === "needs_review") return NEEDS_REVIEW.includes(resolution.state);
  if (filter === "expired") return resolution.state === "RENEWAL_REQUIRED";
  if (filter === "unresolved") return resolution.state === "UNRESOLVED";
  if (filter === "resolved") return RESOLVED.includes(resolution.state);
  return true;
}

export const CASE_FILTERS: { id: CaseFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs_supplier", label: "Needs supplier" },
  { id: "waiting_supplier", label: "Waiting supplier" },
  { id: "waiting_upstream", label: "Waiting upstream" },
  { id: "needs_authorization", label: "Needs authorization" },
  { id: "conflict", label: "Conflict" },
  { id: "needs_review", label: "Needs review" },
  { id: "expired", label: "Expired" },
  { id: "unresolved", label: "Unresolved" },
  { id: "resolved", label: "Resolved" },
];

export interface ResolutionHealth {
  missing: number;
  inProgress: number;
  waitingSupplier: number;
  waitingUpstream: number;
  authorizationRequired: number;
  conflict: number;
  unresolved: number;
}

/** Catalogue-scale snapshot from the product spec. Demo cases are the clickable subset. */
export const CATALOGUE_HEALTH: ResolutionHealth = {
  missing: 8614,
  inProgress: 5811,
  waitingSupplier: 1940,
  waitingUpstream: 431,
  authorizationRequired: 217,
  conflict: 83,
  unresolved: 132,
};

export function healthFromCases(cases: ResolutionCase[]): ResolutionHealth {
  return {
    missing: cases.filter((c) => !RESOLVED.includes(c.state)).length,
    inProgress: cases.filter((c) => !RESOLVED.includes(c.state) && c.state !== "UNRESOLVED").length,
    waitingSupplier: cases.filter((c) => WAITING_SUPPLIER.includes(c.state)).length,
    waitingUpstream: cases.filter((c) => c.state === "WAITING_UPSTREAM").length,
    authorizationRequired: cases.filter((c) => NEEDS_AUTH.includes(c.state)).length,
    conflict: cases.filter((c) => c.state === "CONFLICT").length,
    unresolved: cases.filter((c) => c.state === "UNRESOLVED").length,
  };
}

export function casesForProduct(state: EngineState, productId: string): ResolutionCase[] {
  return state.cases.filter((c) => {
    const requirement = state.requirements.find((r) => r.id === c.requirementId);
    return c.productId === productId || requirement?.productIds.includes(productId);
  });
}

export function productBlockers(state: EngineState, productId: string) {
  return casesForProduct(state, productId)
    .filter((c) => !RESOLVED.includes(c.state))
    .map((c) => {
      const requirement = state.requirements.find((r) => r.id === c.requirementId);
      return {
        caseId: c.id,
        property: requirement?.propertyLabel ?? c.id,
        subject: requirement?.subjectLabel ?? "",
        headline: c.blockingExplanation ?? c.nextAction,
        state: c.state,
        reason: c.blockingReason,
        actorLabel: actorLabelForViewer(state, c.currentActorId, true),
      };
    });
}

export function actorLabelForViewer(state: EngineState, actorId: string | undefined, manufacturerView: boolean): string {
  if (!actorId) return "Unassigned";
  const actor = state.actors.find((a) => a.id === actorId);
  const rel = state.relationships.find((r) => r.toActorId === actorId);
  return visibleActorName({
    actorName: actor?.name ?? actorId,
    viewerIsManufacturer: manufacturerView,
    confidentialUpstream: Boolean(actor?.confidential || rel?.confidentialUpstream),
  });
}

export function supplierHealth(state: EngineState, supplierId: string) {
  const cases = state.cases.filter((c) => {
    if (c.supplierId === supplierId) return true;
    return state.attempts.some((a) => a.caseId === c.id && a.actorId === supplierId);
  });
  return {
    overdue: cases.filter((c) => c.blockingReason === "NO_RESPONSE" && c.state === "WAITING_RESPONSE").length,
    forwardedUpstream: cases.filter((c) => c.state === "WAITING_UPSTREAM").length,
    confidential: cases.filter((c) => c.blockingReason === "CONFIDENTIAL").length,
    awaitingEvidence: cases.filter((c) => c.state === "EVIDENCE_REQUIRED").length,
    conflict: cases.filter((c) => c.state === "CONFLICT").length,
  };
}

export function caseById(state: EngineState, id: string): ResolutionCase | undefined {
  return state.cases.find((c) => c.id === id);
}

export function requirementByCase(state: EngineState, caseId: string) {
  const resolution = caseById(state, caseId);
  if (!resolution) return undefined;
  return state.requirements.find((r) => r.id === resolution.requirementId);
}

export function attemptsForCase(state: EngineState, caseId: string) {
  return state.attempts.filter((a) => a.caseId === caseId);
}

export function eventsForCase(state: EngineState, caseId: string) {
  return state.events.filter((e) => e.caseId === caseId);
}

export function tasksForCase(state: EngineState, caseId: string) {
  return state.tasks.filter((t) => t.caseId === caseId);
}

export function requestForCase(state: EngineState, caseId: string) {
  const resolution = caseById(state, caseId);
  if (!resolution?.requestId) return state.requests.find((r) => r.caseId === caseId);
  return state.requests.find((r) => r.id === resolution.requestId);
}

export function caseByPortalToken(state: EngineState, token: string) {
  return state.cases.find((c) => c.portalToken === token);
}

export function manufacturerMaySeeActor(state: EngineState, actor: Actor): boolean {
  if (actor.confidential) return false;
  const rel = state.relationships.find((r) => r.toActorId === actor.id);
  return !rel?.confidentialUpstream;
}

export { caseReadiness };
