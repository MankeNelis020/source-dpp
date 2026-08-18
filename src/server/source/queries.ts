import { caseReadiness } from "@/domain/source/engine";
import { explainException } from "@/domain/source/copy";
import type { CaseFilter, EngineState, ResolutionCase, ResolutionCaseState } from "@/domain/source/types";
import { matchesFilter } from "@/domain/source/queries";
import type { PersistencePort } from "@/infrastructure/database/ports";
import { hasCapability } from "./authorization";
import { isConfidentialActor, projectActor, projectEvidence, safeActorLabel, sanitizeAudit } from "./confidentiality";
import type { Principal, PortalPrincipal } from "./types";
import { SourceError } from "./types";

const DETECTED: ResolutionCaseState[] = ["DETECTED", "RESOLVING_IDENTITY", "SEARCHING_EXISTING_DATA"];
const RESOLVING: ResolutionCaseState[] = ["ROUTING", "REVIEW_ROUTING", "RESPONSE_RECEIVED", "VALIDATING", "EVIDENCE_REQUIRED", "RENEWAL_REQUIRED"];
const WAITING: ResolutionCaseState[] = ["WAITING_RESPONSE", "REQUEST_PENDING", "WAITING_UPSTREAM", "AUTHORIZATION_REQUIRED"];
const NEEDS_YOU: ResolutionCaseState[] = ["IDENTITY_REVIEW", "CONFLICT", "CONTACT_REQUIRED", "NDA_REQUIRED", "PERMISSION_CHECK"];
const RESOLVED: ResolutionCaseState[] = ["READY", "RETURNED", "MONITORING"];

export interface CaseListItem {
  id: string;
  propertyLabel: string;
  subjectLabel: string;
  actorLabel: string;
  supplierId?: string;
  blockingReason?: string;
  nextAction: string;
  nextActionAt?: string;
  state: ResolutionCaseState;
  version: number;
  productId?: string;
  ownerLabel?: string;
}

export interface NeedsYouTask {
  id: string;
  caseId?: string;
  title: string;
  context: string;
  recommendedAction: string;
  kind: string;
  unlock: number;
  minutesEstimate: number;
}

function loadTenant(store: PersistencePort, principal: Principal): EngineState {
  return store.loadEngine(principal.organisationId);
}

export function getWorkspaceOverview(store: PersistencePort, principal: Principal) {
  const state = loadTenant(store, principal);
  const cases = state.cases;
  const missing = cases.filter((c) => !RESOLVED.includes(c.state)).length;
  const needsYou = cases.filter((c) => NEEDS_YOU.includes(c.state)).length;
  const waitingSupplier = cases.filter((c) => c.state === "WAITING_RESPONSE").length;
  const waitingUpstream = cases.filter((c) => c.state === "WAITING_UPSTREAM").length;
  const resolved = cases.filter((c) => RESOLVED.includes(c.state)).length;
  const readyShare = cases.length ? Math.round((resolved / cases.length) * 100) : 0;
  return {
    organisation: { id: principal.organisationId, name: state.tenant.name },
    summary: {
      readyPercent: readyShare,
      missing,
      sourceCanResolve: cases.filter((c) => c.state === "AUTHORIZATION_REQUIRED" || c.automationLevel !== "L0").length,
      waitingOnSuppliers: waitingSupplier + waitingUpstream,
      needsYou,
      resolved,
    },
    liveCounts: {
      products: new Set(state.requirements.flatMap((r) => r.productIds)).size,
      suppliers: state.actors.filter((a) => a.kind === "organisation" && a.id !== state.tenant.id && !a.confidential).length,
      relationships: state.relationships.filter((r) => !r.confidentialUpstream).length,
      requirements: state.requirements.length,
    },
    activity: state.events
      .slice()
      .reverse()
      .slice(0, 12)
      .map((e) => sanitizeAudit(state, e)),
  };
}

export function getResolutionWorkboard(store: PersistencePort, principal: Principal) {
  const state = loadTenant(store, principal);
  const bucket = (states: ResolutionCaseState[]) => state.cases.filter((c) => states.includes(c.state)).length;
  return {
    columns: {
      DETECTED: bucket(DETECTED),
      RESOLVING: bucket(RESOLVING),
      WAITING: bucket(WAITING),
      NEEDS_YOU: bucket(NEEDS_YOU) + state.tasks.filter((t) => t.status === "open").length,
      RESOLVED: bucket(RESOLVED) + state.cases.filter((c) => c.state === "UNRESOLVED").length,
    },
    activity: state.events.slice().reverse().slice(0, 20).map((e) => sanitizeAudit(state, e)),
    breakdown: {
      sourceCanResolve: {
        reusableEvidence: state.cases.filter((c) => c.state === "AUTHORIZATION_REQUIRED").length,
        waitingSuppliers: state.cases.filter((c) => c.state === "WAITING_RESPONSE").length,
        forwardedUpstream: state.cases.filter((c) => c.state === "WAITING_UPSTREAM").length,
      },
      needsYou: {
        identity: state.cases.filter((c) => c.state === "IDENTITY_REVIEW").length,
        conflict: state.cases.filter((c) => c.state === "CONFLICT").length,
        contact: state.cases.filter((c) => c.state === "CONTACT_REQUIRED").length,
        permission: state.cases.filter((c) => c.state === "PERMISSION_CHECK" || c.state === "NDA_REQUIRED").length,
      },
    },
  };
}

export function getCaseList(store: PersistencePort, principal: Principal, filter: CaseFilter = "all"): CaseListItem[] {
  const state = loadTenant(store, principal);
  return state.cases.filter((c) => matchesFilter(c, filter)).map((c) => toListItem(state, c));
}

function toListItem(state: EngineState, c: ResolutionCase): CaseListItem {
  const requirement = state.requirements.find((r) => r.id === c.requirementId);
  return {
    id: c.id,
    propertyLabel: requirement?.propertyLabel ?? c.id,
    subjectLabel: requirement?.subjectLabel ?? "",
    actorLabel: safeActorLabel(state, c.currentActorId),
    supplierId: c.supplierId && !isConfidentialActor(state, c.supplierId) ? c.supplierId : undefined,
    blockingReason: c.blockingReason,
    nextAction: c.nextAction,
    nextActionAt: c.nextActionAt,
    state: c.state,
    version: c.version,
    productId: c.productId,
    ownerLabel: c.ownerLabel,
  };
}

export function getCaseDetail(store: PersistencePort, principal: Principal, caseId: string) {
  const state = loadTenant(store, principal);
  const resolution = state.cases.find((c) => c.id === caseId);
  if (!resolution) throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  const requirement = state.requirements.find((r) => r.id === resolution.requirementId);
  const claim = state.claims.find((c) => c.caseId === caseId);
  const evidence = claim?.evidenceId ? state.evidence.find((e) => e.id === claim.evidenceId) : undefined;
  const canPrivate = hasCapability(principal, "evidence:read_private");
  const contacts = state.contacts
    .filter((c) => c.actorId === resolution.currentActorId && !isConfidentialActor(state, c.actorId))
    .map((c) => ({ id: c.id, role: c.role, name: c.name, valid: c.valid }));
  const exception = resolution.blockingReason ? explainException(resolution.blockingReason) : null;
  return {
    id: resolution.id,
    state: resolution.state,
    version: resolution.version,
    nextAction: resolution.nextAction,
    nextActionAt: resolution.nextActionAt,
    blockingReason: resolution.blockingReason,
    blockingExplanation: resolution.blockingExplanation,
    ownerLabel: resolution.ownerLabel,
    automationLevel: resolution.automationLevel,
    identityStatus: resolution.identityStatus,
    identityModelVersion: resolution.identityModelVersion ?? "heuristic-v0",
    identityScoresAreCalibrated: false,
    actor: projectActor(state, resolution.currentActorId),
    actorLabel: safeActorLabel(state, resolution.currentActorId),
    requirement: requirement
      ? {
          id: requirement.id,
          propertyLabel: requirement.propertyLabel,
          subjectLabel: requirement.subjectLabel,
          purpose: requirement.purpose,
          requiredBy: requirement.requiredBy,
          productIds: requirement.productIds,
        }
      : undefined,
    request: state.requests
      .filter((r) => r.caseId === caseId)
      .map((r) => ({ id: r.id, status: r.status, dueAt: r.dueAt, reminderCount: r.reminderCount }))[0],
    attempts: state.attempts
      .filter((a) => a.caseId === caseId)
      .map((a) => ({
        id: a.id,
        method: a.method,
        status: a.status,
        costEstimate: a.costEstimate,
        parentAttemptId: a.parentAttemptId,
        actor: projectActor(state, a.actorId),
      })),
    events: state.events.filter((e) => e.caseId === caseId).map((e) => sanitizeAudit(state, e)),
    tasks: state.tasks.filter((t) => t.caseId === caseId),
    readiness: caseReadiness(state, caseId),
    exception,
    conflict: state.conflicts.find((c) => c.caseId === caseId && !c.resolved),
    claim: claim
      ? {
          id: claim.id,
          value: claim.value,
          unit: claim.unit,
          ready: claim.ready,
          trustLevel: claim.trustLevel,
          permissionState: claim.permissionState,
        }
      : undefined,
    evidence: projectEvidence(evidence, canPrivate),
    contacts,
  };
}

export function getProductBlockers(store: PersistencePort, principal: Principal, productId: string) {
  const state = loadTenant(store, principal);
  const known = new Set(state.requirements.flatMap((r) => r.productIds));
  if (!known.has(productId) && !state.subjects.some((s) => s.id === productId)) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
  return state.cases
    .filter((c) => {
      const requirement = state.requirements.find((r) => r.id === c.requirementId);
      return c.productId === productId || requirement?.productIds.includes(productId);
    })
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
        actorLabel: safeActorLabel(state, c.currentActorId),
      };
    });
}

export function getProductDetail(store: PersistencePort, principal: Principal, productId: string) {
  const blockers = getProductBlockers(store, principal, productId);
  const state = loadTenant(store, principal);
  const subject = state.subjects.find((s) => s.id === productId);
  const children = state.subjectRelationships
    .filter((r) => r.parentSubjectId === productId)
    .map((r) => {
      const child = state.subjects.find((s) => s.id === r.childSubjectId);
      return {
        id: r.childSubjectId,
        name: child?.name ?? r.childSubjectId,
        kind: child?.kind,
        source: child?.source,
        confidence: child?.confidence,
      };
    });
  return {
    id: productId,
    name: subject?.name ?? productId,
    kind: subject?.kind ?? "PRODUCT",
    source: subject?.source,
    blockers,
    children,
  };
}

export function getNeedsYouTasks(store: PersistencePort, principal: Principal): NeedsYouTask[] {
  const state = loadTenant(store, principal);
  const tasks: NeedsYouTask[] = state.tasks
    .filter((t) => t.status === "open")
    .map((t) => {
      const requirement = state.requirements.find((r) => {
        const resolution = state.cases.find((c) => c.id === t.caseId);
        return resolution && r.id === resolution.requirementId;
      });
      const unlock = requirement?.productIds.length ?? 1;
      return {
        id: t.id,
        caseId: t.caseId,
        title: t.title,
        context: t.context,
        recommendedAction: t.recommendedAction,
        kind: t.kind,
        unlock,
        minutesEstimate: t.kind === "identity" ? 3 : 5,
      };
    });
  return tasks.sort((a, b) => b.unlock - a.unlock);
}

export function getSupplierPortalView(store: PersistencePort, principal: PortalPrincipal) {
  const state = store.loadEngine(principal.organisationId);
  const cases = state.cases.filter((c) => principal.allowedCaseIds.includes(c.id));
  return {
    requesterName: state.tenant.name,
    actorId: principal.actorId,
    allowedCommands: principal.allowedCommands,
    questions: cases.map((c) => {
      const requirement = state.requirements.find((r) => r.id === c.requirementId);
      return {
        id: c.id,
        version: c.version,
        state: c.state,
        propertyLabel: requirement?.propertyLabel,
        subjectLabel: requirement?.subjectLabel,
        nextAction: c.nextAction,
      };
    }),
  };
}

export function searchTenant(store: PersistencePort, principal: Principal, query: string) {
  const q = query.trim().toLowerCase();
  const state = loadTenant(store, principal);
  if (!q) return { actors: [], subjects: [], evidence: [] };
  const actors = state.actors
    .filter((a) => !a.confidential && !isConfidentialActor(state, a.id))
    .filter((a) => a.name.toLowerCase().includes(q) || a.legalName.toLowerCase().includes(q))
    .filter((a) => a.id !== "mill-north" && a.id !== "mill-private")
    .map((a) => ({ id: a.id, name: a.name, kind: a.kind }));
  const subjects = state.subjects
    .filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
    .map((s) => ({ id: s.id, name: s.name, kind: s.kind }));
  const evidence = hasCapability(principal, "evidence:read")
    ? state.evidence
        .filter((e) => e.filename.toLowerCase().includes(q) && e.visibility !== "private")
        .map((e) => ({ id: e.id, filename: e.filename }))
    : [];
  return { actors, subjects, evidence };
}

export function getEvidenceAccess(store: PersistencePort, principal: Principal, evidenceId: string) {
  const state = loadTenant(store, principal);
  const evidence = state.evidence.find((e) => e.id === evidenceId);
  if (!evidence) throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  if (evidence.visibility === "private" && !hasCapability(principal, "evidence:read_private")) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
  store.appendAudit({
    id: store.nextId("aud"),
    organisationId: principal.organisationId,
    principalId: principal.userId,
    action: "EVIDENCE_VIEWED_PRIVATE",
    resource: evidenceId,
    result: "ok",
    detail: "Authorized evidence metadata read.",
    createdAt: new Date().toISOString(),
  });
  return projectEvidence(evidence, hasCapability(principal, "evidence:read_private"));
}
