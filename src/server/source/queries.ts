import { caseReadiness } from "@/domain/source/engine";
import { explainException } from "@/domain/source/copy";
import type { CaseFilter, EngineState, ResolutionCase, ResolutionCaseState } from "@/domain/source/types";
import { matchesFilter } from "@/domain/source/queries";
import { evaluatePilotRun, humanPilotSentences } from "@/domain/source/analytics";
import type { PersistencePort } from "@/infrastructure/database/ports";
import { hasCapability } from "./authorization";
import { isConfidentialActor, projectActor, projectEvidenceForState, safeActorLabel } from "./confidentiality";
import { evaluateEvidenceDisclosure, hasEvidenceByteAccess, opaqueEvidenceRef, resolveEvidenceIdFromOpaqueRef } from "./disclosure";
import { projectDomainEvent, projectStructuredAudit } from "./audit";
import type { Principal, PortalPrincipal } from "./types";
import { SourceError } from "./types";
import type { EvidenceStorage } from "@/infrastructure/storage/evidence";
import { getMemoryEvidenceStorage } from "@/infrastructure/storage/evidence";
import { METRICS, metricInc, logOperational } from "@/infrastructure/observability/metrics";

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
  requirementsUnlocked?: number;
  minutesEstimate: number;
}

function loadTenant(store: PersistencePort, principal: Principal): Promise<EngineState> | EngineState {
  return store.loadEngine(principal.organisationId);
}

export async function getWorkspaceOverview(store: PersistencePort, principal: Principal) {
  const state = await loadTenant(store, principal);
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
      .map((e) => projectDomainEvent(state, e, "tenant")),
  };
}

export async function getResolutionWorkboard(store: PersistencePort, principal: Principal) {
  const state = await loadTenant(store, principal);
  const bucket = (states: ResolutionCaseState[]) => state.cases.filter((c) => states.includes(c.state)).length;
  return {
    columns: {
      DETECTED: bucket(DETECTED),
      RESOLVING: bucket(RESOLVING),
      WAITING: bucket(WAITING),
      NEEDS_YOU: bucket(NEEDS_YOU),
      RESOLVED: bucket(RESOLVED),
      UNRESOLVED: state.cases.filter((c) => c.state === "UNRESOLVED").length,
    },
    activity: state.events.slice().reverse().slice(0, 20).map((e) => projectDomainEvent(state, e, "tenant")),
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

export async function getCaseList(store: PersistencePort, principal: Principal, filter: CaseFilter = "all"): Promise<CaseListItem[]> {
  const state = await loadTenant(store, principal);
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

export async function getCaseDetail(store: PersistencePort, principal: Principal, caseId: string) {
  const state = await loadTenant(store, principal);
  const resolution = state.cases.find((c) => c.id === caseId);
  if (!resolution) throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  const requirement = state.requirements.find((r) => r.id === resolution.requirementId);
  const claim = state.claims.find((c) => c.caseId === caseId);
  const evidence = claim?.evidenceId ? state.evidence.find((c) => c.id === claim.evidenceId) : undefined;
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
    events: state.events.filter((e) => e.caseId === caseId).map((e) => projectDomainEvent(state, e, "tenant")),
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
    evidence: projectEvidenceForState(state, evidence, principal.capabilities),
    contacts,
  };
}

export async function getProductBlockers(store: PersistencePort, principal: Principal, productId: string) {
  const state = await loadTenant(store, principal);
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

export async function getProductDetail(store: PersistencePort, principal: Principal, productId: string) {
  const blockers = await getProductBlockers(store, principal, productId);
  const state = await loadTenant(store, principal);
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
  const relatedCases = state.cases.filter((c) => {
    const requirement = state.requirements.find((r) => r.id === c.requirementId);
    return c.productId === productId || requirement?.productIds.includes(productId) || requirement?.subjectId === productId;
  });
  return {
    id: productId,
    name: subject?.name ?? productId,
    kind: subject?.kind ?? "PRODUCT",
    source: subject?.source,
    blockers,
    children,
    buckets: {
      READY: relatedCases.filter((c) => c.state === "READY" || c.state === "MONITORING").length,
      RESOLVING: relatedCases.filter((c) => RESOLVING.includes(c.state)).length,
      WAITING: relatedCases.filter((c) => WAITING.includes(c.state)).length,
      NEEDS_YOU: relatedCases.filter((c) => NEEDS_YOU.includes(c.state)).length,
      UNRESOLVED: relatedCases.filter((c) => c.state === "UNRESOLVED").length,
    },
    requirements: state.requirements
      .filter((r) => r.productIds.includes(productId) || r.subjectId === productId)
      .map((r) => {
        const resolution = state.cases.find((c) => c.id === r.linkedCaseId);
        return {
          id: r.id,
          propertyLabel: r.propertyLabel,
          subjectLabel: r.subjectLabel,
          state: resolution?.state,
          selectedRoute: r.selectedRoute,
          selectedRouteReason: r.selectedRouteReason,
          mechanism: r.resolutionMechanism,
        };
      }),
  };
}

export async function getNeedsYouTasks(store: PersistencePort, principal: Principal): Promise<NeedsYouTask[]> {
  const state = await loadTenant(store, principal);
  const tasks: NeedsYouTask[] = state.tasks
    .filter((t) => t.status === "open")
    .map((t) => {
      const requirement = state.requirements.find((r) => {
        const resolution = state.cases.find((c) => c.id === t.caseId);
        return resolution && r.id === resolution.requirementId;
      });
      const subjectId = requirement?.subjectId;
      const related = state.requirements.filter((r) => r.subjectId === subjectId && !r.resolvedAt);
      const unlock = new Set(related.flatMap((r) => r.productIds)).size || requirement?.productIds.length || 1;
      const requirementsUnlocked = related.length;
      return {
        id: t.id,
        caseId: t.caseId,
        title: t.title,
        context: t.context,
        recommendedAction: t.recommendedAction,
        kind: t.kind,
        unlock,
        requirementsUnlocked,
        minutesEstimate: t.kind === "identity" ? 4 : 5,
      };
    });
  return tasks.sort((a, b) => b.unlock - a.unlock);
}

export async function getSupplierPortalView(store: PersistencePort, principal: PortalPrincipal) {
  const state = await store.loadEngine(principal.organisationId);
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

export async function searchTenant(store: PersistencePort, principal: Principal, query: string) {
  const q = query.trim().toLowerCase();
  const state = await loadTenant(store, principal);
  if (!q) return { actors: [], subjects: [], evidence: [] };
  const actors = state.actors
    .filter((a) => !isConfidentialActor(state, a.id))
    .filter((a) => a.name.toLowerCase().includes(q) || a.legalName.toLowerCase().includes(q))
    .map((a) => ({ id: a.id, name: a.name, kind: a.kind }));
  const subjects = state.subjects
    .filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
    .map((s) => ({ id: s.id, name: s.name, kind: s.kind }));
  const evidence = hasCapability(principal, "evidence:read")
    ? state.evidence
        .filter((e) => {
          const decision = evaluateEvidenceDisclosure({
            state,
            evidence: e,
            capabilities: principal.capabilities,
            organisationId: principal.organisationId,
          });
          return decision.canRevealFilename && e.filename.toLowerCase().includes(q);
        })
        .map((e) => ({
          opaqueRef: opaqueEvidenceRef(principal.organisationId, e.id),
          filename: e.filename,
        }))
    : [];
  return { actors, subjects, evidence };
}

export async function getEvidenceAccess(
  store: PersistencePort,
  principal: Principal,
  reference: string,
  storage: EvidenceStorage = getMemoryEvidenceStorage()
) {
  const state = await loadTenant(store, principal);
  const byOpaque = resolveEvidenceIdFromOpaqueRef(principal.organisationId, reference);
  const evidence = state.evidence.find((item) => item.id === (byOpaque ?? reference));
  if (!evidence) {
    metricInc(METRICS.evidenceAccessDenied);
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
  const decision = evaluateEvidenceDisclosure({
    state,
    evidence,
    capabilities: principal.capabilities,
    organisationId: principal.organisationId,
  });
  if (decision.level === "NONE" || decision.level === "ATTESTATION_ONLY" || decision.level === "EXISTENCE_ONLY") {
    metricInc(METRICS.evidenceAccessDenied);
    logOperational("evidence.access_denied", { organisationId: principal.organisationId });
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }

  const projection = projectEvidenceForState(state, evidence, principal.capabilities);
  let signedUrl: string | undefined;
  if (hasEvidenceByteAccess(principal, decision)) {
    const object = await store.getEvidence(evidence.id);
    const key = object?.storageKey ?? `evidence/${principal.organisationId}/${evidence.id}`;
    signedUrl = await storage.createSignedRead({ key, ttlSeconds: 60 });
  }

  await store.appendAudit({
    id: await Promise.resolve(store.nextId("aud")),
    organisationId: principal.organisationId,
    principalId: principal.userId,
    action: signedUrl ? "EVIDENCE_SIGNED_URL" : "EVIDENCE_VIEWED_PRIVATE",
    resourceType: "Evidence",
    result: "success",
    publicContext: { opaqueRef: opaqueEvidenceRef(principal.organisationId, evidence.id) },
    createdAt: new Date().toISOString(),
    policyVersion: "p01-v1",
  });

  if (!projection) {
    metricInc(METRICS.evidenceAccessDenied);
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }

  return {
    ...projection,
    signedUrl,
  };
}

export async function getTenantAudit(store: PersistencePort, principal: Principal) {
  const state = await loadTenant(store, principal);
  const domain = state.events.map((event) => projectDomainEvent(state, event, "tenant"));
  const structured = (await store.listAudit(principal.organisationId)).map((event) => projectStructuredAudit(event, "tenant"));
  return [...domain, ...structured].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function getInternalAudit(store: PersistencePort, principal: Principal) {
  if (!hasCapability(principal, "audit:read_internal")) {
    throw new SourceError("FORBIDDEN", "You cannot perform this action.", 403);
  }
  const state = await loadTenant(store, principal);
  const domain = state.events.map((event) => projectDomainEvent(state, event, "internal"));
  const structured = (await store.listAudit(principal.organisationId)).map((event) => projectStructuredAudit(event, "internal"));
  return [...domain, ...structured];
}

export async function getMaterialDetail(store: PersistencePort, principal: Principal, materialId: string) {
  const state = await loadTenant(store, principal);
  const subject = state.subjects.find((s) => s.id === materialId);
  if (!subject || (subject.kind !== "MATERIAL" && subject.kind !== "RAW_MATERIAL" && subject.kind !== "COMPONENT")) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
  const productIds = new Set(
    state.requirements.filter((r) => r.subjectId === materialId).flatMap((r) => r.productIds)
  );
  const reqs = state.requirements.filter((r) => r.subjectId === materialId);
  const cases = state.cases.filter((c) => reqs.some((r) => r.id === c.requirementId));
  return {
    id: materialId,
    name: subject.name,
    kind: subject.kind,
    usedInProducts: productIds.size,
    components: state.subjectRelationships.filter((r) => r.childSubjectId === materialId).length,
    suppliers: new Set(cases.map((c) => c.supplierId).filter(Boolean)).size,
    requirements: reqs.length,
    ready: reqs.filter((r) => r.resolvedAt).length,
    resolving: cases.filter((c) => !["READY", "UNRESOLVED", "MONITORING"].includes(c.state)).length,
    blocked: cases.filter((c) => ["AUTHORIZATION_REQUIRED", "CONFLICT", "IDENTITY_REVIEW"].includes(c.state)).length,
  };
}

export async function getSupplierOverview(store: PersistencePort, principal: Principal, supplierId: string) {
  const state = await loadTenant(store, principal);
  const actor = state.actors.find((a) => a.id === supplierId);
  if (!actor || actor.confidential) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
  const cases = state.cases.filter((c) => c.supplierId === supplierId);
  const products = new Set(cases.map((c) => c.productId).filter(Boolean));
  return {
    id: supplierId,
    name: actor.name,
    legalName: actor.legalName,
    country: actor.country,
    productsSupplied: products.size,
    components: state.subjectRelationships.filter((r) => cases.some((c) => c.productId === r.parentSubjectId)).length,
    openRequirements: cases.filter((c) => c.state !== "READY" && c.state !== "UNRESOLVED").length,
    evidenceReused: state.requirementOutcomes.filter((o) =>
      ["EXISTING_CLAIM", "SAME_TENANT_REUSE", "EVIDENCE_EXTRACTION"].includes(o.mechanism)
    ).length,
    requestsAvoided: state.contactAvoidances.filter((a) => a.supplierActorId === supplierId).length,
    activeRequests: state.requests.filter((r) => r.supplierId === supplierId && (r.status === "SENT" || r.status === "DELIVERED" || r.status === "STARTED")).length,
    waitingUpstream: cases.filter((c) => c.state === "WAITING_UPSTREAM").length,
  };
}

export async function getPilotResults(store: PersistencePort, principal: Principal) {
  const state = await loadTenant(store, principal);
  const run = state.pilotRuns[state.pilotRuns.length - 1];
  if (!run) {
    return { run: null, evaluation: null, sentences: [] as string[] };
  }
  const evaluation = evaluatePilotRun(state, run);
  return { run, evaluation, sentences: humanPilotSentences(evaluation) };
}
