import { explainException } from "./copy";
import { wouldCreateCycle } from "./cycles";
import { STANDARD_SUPPLIER_14D, nextPendingStep, upcomingStep } from "./escalation";
import { resolveIdentity } from "./identity";
import { IDENTITY_ENGINE_VERSION } from "./identity";
import { evaluatePermission } from "./permissions";
import { evaluateReadiness, mayAutoLinkEvidence } from "./readiness";
import { findActiveDuplicate } from "./reuse";
import { pickContact } from "./routing";
import { defaultPropertiesForKind, productIdsForSubject } from "./subjects";
import { gatherPlannerInput, planResolution } from "./planner";
import { evidenceScopeApplies } from "./propagation";
import { recordContactAvoided, recordRequirementOutcome } from "./analytics";
import { currentDataDisclosureTerms, dataDisclosureTermsByVersion } from "./disclosure-terms";
import {
  assessRequirementSufficiency,
  classifyEvidenceStrength,
  defaultEvidenceReusePolicy,
  documentaryRoute,
  isSupportedReusePolicy,
  mapDisclosureModeToEvidenceVisibility,
  mapDisclosureModeToPermissionVisibility,
  reuseRank,
} from "./evidence-policy";
import {
  findReuseConsent,
  inheritedDisclosureMode,
  reuseConsentKey,
} from "./reuse-consent";
import type {
  AuditEvent,
  ClaimRecord,
  Command,
  ContactPoint,
  DisclosureAgreementAcceptance,
  EngineResult,
  EngineState,
  EvidenceRecord,
  EvidenceReuseConsent,
  ExceptionCode,
  PermissionGrant,
  RequirementEvidenceAssessment,
  ResolutionAttempt,
  ResolutionCase,
  ResolutionMechanism,
  SubjectRelationKind,
  SupplierRequest,
} from "./types";

export class EngineValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "EngineValidationError";
    this.code = code;
  }
}

export function hydrateEngineState(state: EngineState): EngineState {
  state.requirementOutcomes ??= [];
  state.contactAvoidances ??= [];
  state.pilotRuns ??= [];
  state.requestGroups ??= [];
  state.disclosureAcceptances ??= [];
  state.requirementAssessments ??= [];
  state.cannotProvideResponses ??= [];
  state.reuseConsents ??= [];
  return state;
}

export function emptyState(tenant?: { id: string; name: string }): EngineState {
  return {
    actors: [],
    contacts: [],
    relationships: [],
    requirements: [],
    cases: [],
    attempts: [],
    exceptions: [],
    requests: [],
    claims: [],
    evidence: [],
    permissions: [],
    conflicts: [],
    tasks: [],
    events: [],
    policies: [STANDARD_SUPPLIER_14D],
    dependencies: [],
    subjects: [],
    subjectRelationships: [],
    subjectIdentifiers: [],
    tenantSubjectMappings: [],
    identityDecisions: [],
    requirementOutcomes: [],
    contactAvoidances: [],
    pilotRuns: [],
    requestGroups: [],
    disclosureAcceptances: [],
    requirementAssessments: [],
    cannotProvideResponses: [],
    reuseConsents: [],
    tenant: {
      id: tenant?.id ?? "acme",
      name: tenant?.name ?? "Acme Manufacturing B.V.",
      identityAutoLinkThreshold: 95,
    },
    seq: 1,
  };
}

export function applyCommand(state: EngineState, command: Command, now: Date): EngineResult {
  const next = hydrateEngineState(structuredClone(state));
  const events: AuditEvent[] = [];
  const emit = (event: Omit<AuditEvent, "id">) => {
    const full: AuditEvent = { ...event, id: id(next, "evt") };
    next.events.push(full);
    events.push(full);
  };

  switch (command.type) {
    case "OPEN_REQUIREMENT":
      return openRequirement(next, command, now, emit);
    case "SEND_REQUEST":
      sendRequest(next, command.caseId, now, emit, command.contactId);
      return done(next, events, command.caseId);
    case "TICK_NO_RESPONSE":
      tickNoResponse(next, command.caseId, now, emit);
      return done(next, events, command.caseId);
    case "SEND_REMINDER":
      sendReminder(next, command.caseId, now, emit, false);
      return done(next, events, command.caseId);
    case "ESCALATE":
      escalate(next, command.caseId, now, emit);
      return done(next, events, command.caseId);
    case "CHANGE_CONTACT":
      changeContact(next, command.caseId, command.contactId, now, emit);
      return done(next, events, command.caseId);
    case "MARK_BOUNCE":
      markBounce(next, command.caseId, command.contactId, now, emit);
      return done(next, events, command.caseId);
    case "MARK_WRONG_CONTACT":
      markWrongContact(next, command, now, emit);
      return done(next, events, command.caseId);
    case "MARK_UNKNOWN":
      markUnknown(next, command.caseId, command.choice, now, emit);
      return done(next, events, command.caseId);
    case "FORWARD_UPSTREAM":
      forwardUpstream(next, command, now, emit);
      return done(next, events, command.caseId);
    case "DECLINE":
      decline(next, command, now, emit);
      return done(next, events, command.caseId);
    case "ACCEPT_EVIDENCE_DISCLOSURE":
      acceptEvidenceDisclosure(next, command, now, emit);
      return done(next, events, command.caseId);
    case "SUBMIT_RESPONSE":
      submitResponse(next, command, now, emit);
      return done(next, events, command.caseId);
    case "DECIDE_EVIDENCE_REUSE":
      decideEvidenceReuse(next, command, now, emit);
      return done(next, events, command.caseId);
    case "GRANT_PERMISSION":
      setPermission(next, command.caseId, "GRANTED", now, emit);
      return done(next, events, command.caseId);
    case "DENY_PERMISSION":
      setPermission(next, command.caseId, "DENIED", now, emit);
      return done(next, events, command.caseId);
    case "REVOKE_PERMISSION":
      revokePermission(next, command.claimId, now, emit);
      return done(next, events);
    case "EXPIRE_EVIDENCE":
      expireEvidence(next, command.evidenceId, now, emit);
      return done(next, events);
    case "RESOLVE_CONFLICT":
      resolveConflict(next, command.caseId, command.outcome, now, emit);
      return done(next, events, command.caseId);
    case "CONFIRM_IDENTITY":
      confirmIdentity(next, command, now, emit);
      return done(next, events, command.caseId);
    case "CLOSE_UNRESOLVED":
      closeUnresolved(next, command.caseId, command.explanation, now, emit);
      return done(next, events, command.caseId);
    case "ASSIGN_COLLEAGUE":
      assignColleague(next, command.caseId, command.contact, now, emit);
      return done(next, events, command.caseId);
    case "COMPLETE_TASK": {
      const task = next.tasks.find((t) => t.id === command.taskId);
      if (task) task.status = "done";
      return done(next, events);
    }
    case "ADD_SUBJECT":
      addSubject(next, command, now, emit);
      return done(next, events);
    case "MERGE_SUBJECTS":
      mergeSubjects(next, command, now, emit);
      return done(next, events);
    case "SPLIT_SUBJECT":
      splitSubject(next, command, now, emit);
      return done(next, events);
    case "APPLY_BULK_SUBJECT_CORRECTION":
      bulkCorrectSubjects(next, command, now, emit);
      return done(next, events);
    case "CORRECT_SUBJECT_RELATIONSHIP":
      correctSubjectRelationship(next, command, now, emit);
      return done(next, events);
    case "REMOVE_SUBJECT_RELATIONSHIP": {
      const rel = next.subjectRelationships.find((r) => r.id === command.relationshipId);
      next.subjectRelationships = next.subjectRelationships.filter((r) => r.id !== command.relationshipId);
      emit({
        type: "subject.relationship_removed",
        actor: command.createdBy ?? "user",
        timestamp: iso(now),
        detail: rel ? `Removed ${rel.childSubjectId} from ${rel.parentSubjectId}.` : "Relationship removed.",
      });
      return done(next, events);
    }
    case "MARK_SUBJECT_UNKNOWN": {
      const subject = next.subjects.find((s) => s.id === command.subjectId);
      if (subject) {
        subject.name = subject.name.startsWith("Unknown") ? subject.name : `Unknown · ${subject.name}`;
        subject.source = "USER_ADDED";
        subject.confidence = 0;
      }
      emit({
        type: "subject.marked_unknown",
        actor: command.createdBy ?? "user",
        timestamp: iso(now),
        detail: `Marked ${command.subjectId} as unknown. Dependent requirements will be recalculated.`,
      });
      return done(next, events);
    }
    default:
      return done(next, events);
  }
}

function done(state: EngineState, events: AuditEvent[], caseId?: string): EngineResult {
  refreshReadinessCache(state, caseId);
  return { state, events, caseId };
}

function refreshReadinessCache(state: EngineState, caseId?: string) {
  const claims = caseId ? state.claims.filter((c) => c.caseId === caseId) : [];
  for (const claim of claims) {
    const resolution = state.cases.find((c) => c.id === claim.caseId);
    if (!resolution) continue;
    claim.ready = caseReadiness(state, resolution.id).ready;
  }
}

function id(state: EngineState, prefix: string): string {
  state.seq += 1;
  return `${prefix}-${state.seq}`;
}

function iso(now: Date): string {
  return now.toISOString();
}

function addDays(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

function caseById(state: EngineState, caseId: string): ResolutionCase {
  const found = state.cases.find((c) => c.id === caseId);
  if (!found) throw new Error(`Unknown case ${caseId}`);
  return found;
}

function requirementOf(state: EngineState, resolution: ResolutionCase) {
  return state.requirements.find((r) => r.id === resolution.requirementId)!;
}

function ensureOpenTask(
  state: EngineState,
  now: Date,
  task: {
    caseId: string;
    title: string;
    context: string;
    recommendedAction: string;
    ownerLabel: string;
    kind: EngineState["tasks"][number]["kind"];
  }
) {
  if (state.tasks.some((row) => row.caseId === task.caseId && row.kind === task.kind && row.status === "open" && row.title === task.title)) {
    return;
  }
  state.tasks.push({
    id: id(state, "task"),
    status: "open",
    createdAt: iso(now),
    ...task,
  });
}

function fail(
  state: EngineState,
  resolution: ResolutionCase,
  code: ExceptionCode,
  now: Date,
  extra?: Partial<ResolutionCase>
) {
  const copy = explainException(code);
  resolution.blockingReason = code;
  resolution.blockingExplanation = copy.reason;
  resolution.nextAction = extra?.nextAction ?? copy.nextAction;
  Object.assign(resolution, extra);
  resolution.version += 1;
  state.exceptions.push({
    id: id(state, "ex"),
    caseId: resolution.id,
    code,
    explanation: extra?.blockingExplanation ?? copy.reason,
    ownerLabel: resolution.ownerLabel ?? "Unassigned",
    nextAction: resolution.nextAction,
    automationPolicy: copy.automationPolicy,
    escalationDeadline: resolution.nextActionAt ?? addDays(now, 7),
    createdAt: iso(now),
  });
}

function openRequirement(
  state: EngineState,
  command: Extract<Command, { type: "OPEN_REQUIREMENT" }>,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
): EngineResult {
  const requirement = command.requirement;
  const duplicate = findActiveDuplicate({
    requirements: [...state.requirements, requirement],
    subjectId: requirement.subjectId,
    propertyId: requirement.propertyId,
    actorId: command.declaredSupplierId,
    cases: state.cases,
  });
  if (duplicate) {
    const existing = state.requirements.find((r) => r.id === requirement.id);
    if (!existing) {
      state.requirements.push({ ...requirement, linkedCaseId: duplicate.caseId, selectedRoute: "active_duplicate_case" });
    } else {
      existing.linkedCaseId = duplicate.caseId;
      existing.selectedRoute = "active_duplicate_case";
    }
    recordContactAvoided(state, {
      requirementId: requirement.id,
      caseId: duplicate.caseId,
      supplierActorId: command.declaredSupplierId,
      avoidedBy: "DUPLICATE_CASE",
      timestamp: iso(now),
    });
    emit({
      type: "requirement.linked_existing_case",
      caseId: duplicate.caseId,
      actor: "SOURCE_SYSTEM",
      timestamp: iso(now),
      detail: `Linked to existing case ${duplicate.caseId} instead of sending a duplicate request.`,
    });
    emit({
      type: "SUPPLIER_CONTACT_AVOIDED",
      caseId: duplicate.caseId,
      actor: "SOURCE_SYSTEM",
      timestamp: iso(now),
      detail: "An open case already covers this subject and property.",
      payload: { avoidedBy: "DUPLICATE_CASE", requirementId: requirement.id },
    });
    return done(state, state.events.slice(-2), duplicate.caseId);
  }

  if (!state.requirements.some((r) => r.id === requirement.id)) {
    state.requirements.push(requirement);
  }
  emit({
    type: "requirement.created",
    actor: "SOURCE_SYSTEM",
    timestamp: iso(now),
    detail: `Need ${requirement.propertyId} for ${requirement.subjectId}.`,
  });

  const identity = command.identityQuery
    ? resolveIdentity(command.identityQuery, state.actors, state.tenant.identityAutoLinkThreshold)
    : command.declaredSupplierId
      ? {
          status: "IDENTITY_MATCHED" as const,
          selected: state.actors.find((a) => a.id === command.declaredSupplierId),
          candidates: [],
          autoLinkAllowed: true,
        }
      : { status: "IDENTITY_NOT_FOUND" as const, candidates: [], autoLinkAllowed: false };

  const resolution: ResolutionCase = {
    id: requirement.linkedCaseId ?? `SRC-${100000 + state.seq}`,
    requirementId: requirement.id,
    state: "DETECTED",
    currentActorId: identity.selected?.id ?? command.declaredSupplierId,
    nextAction: "Search existing data",
    escalationPolicyId: STANDARD_SUPPLIER_14D.id,
    ownerLabel: "SOURCE",
    openedAt: iso(now),
    version: 1,
    identityStatus: identity.status,
    identityConfidence: identity.candidates[0]?.confidence ?? (identity.status === "IDENTITY_MATCHED" ? 99.8 : undefined),
    identityModelVersion: IDENTITY_ENGINE_VERSION,
    identityCandidateIds: identity.candidates.map((c) => c.actor.id),
    productId: requirement.productIds[0],
    supplierId: identity.selected?.id ?? command.declaredSupplierId,
    automationLevel: "L2",
    portalToken: `t-${requirement.id}`,
    downstreamUsages: [],
  };
  state.seq += 1;
  state.cases.push(resolution);
  requirement.linkedCaseId = resolution.id;

  if (identity.status === "IDENTITY_AMBIGUOUS" || identity.status === "IDENTITY_PROBABLE") {
    resolution.state = "IDENTITY_REVIEW";
    fail(state, resolution, "IDENTITY_AMBIGUOUS", now, {
      nextAction: "Confirm whether these suppliers are the same entity.",
      nextActionAt: addDays(now, 2),
      ownerLabel: "Identity reviewer",
    });
    state.tasks.push({
      id: id(state, "task"),
      caseId: resolution.id,
      title: `Confirm whether ${identity.candidates[0]?.actor.legalName ?? "this organisation"} matches the imported supplier.`,
      context: identity.candidates.map((c) => `${c.actor.legalName} (${c.confidence}%)`).join(" vs "),
      recommendedAction: "Confirm, reject, create new, merge or split. Do not auto-link evidence.",
      ownerLabel: "Identity reviewer",
      status: "open",
      createdAt: iso(now),
      kind: "identity",
    });
    emit({
      type: "identity.review_required",
      caseId: resolution.id,
      actor: "SOURCE_SYSTEM",
      timestamp: iso(now),
      detail: "Two probable matches. Evidence will not be auto-linked.",
    });
    requirement.selectedRoute = "human_review";
    requirement.selectedRouteReason = "We're not sure these are the same supplier.";
    return done(state, state.events.slice(-2), resolution.id);
  }

  resolution.state = "SEARCHING_EXISTING_DATA";
  const plan = planResolution(
    gatherPlannerInput({
      state,
      requirement,
      identityMatched: identity.status === "IDENTITY_MATCHED",
      identityNeedsReview: false,
      declaredSupplierId: resolution.currentActorId,
      now,
    })
  );
  requirement.selectedRoute = plan.strategy;
  requirement.selectedRouteReason = plan.reason;
  emit({
    type: "resolution.plan_selected",
    caseId: resolution.id,
    actor: "SOURCE_SYSTEM",
    timestamp: iso(now),
    detail: plan.reason,
    payload: { strategy: plan.strategy },
  });

  if (plan.candidateClaimId && plan.strategy === "exact_trusted_claim") {
    const claim = state.claims.find((c) => c.id === plan.candidateClaimId);
    if (claim) claim.caseId = resolution.id;
  }

  if (plan.strategy === "exact_trusted_claim" && plan.candidateClaimId) {
    const claim = state.claims.find((c) => c.id === plan.candidateClaimId)!;
    recordContactAvoided(state, {
      requirementId: requirement.id,
      caseId: resolution.id,
      supplierActorId: resolution.currentActorId,
      avoidedBy: "EXISTING_CLAIM",
      claimId: claim.id,
      evidenceId: claim.evidenceId,
      timestamp: iso(now),
    });
    emit({
      type: "SUPPLIER_CONTACT_AVOIDED",
      caseId: resolution.id,
      actor: "SOURCE_SYSTEM",
      timestamp: iso(now),
      detail: plan.reason,
      payload: { avoidedBy: "EXISTING_CLAIM" },
    });
    markReady(state, resolution, claim, now, emit, "Existing claim reused without a new request.", "EXISTING_CLAIM");
    return done(state, state.events.filter((e) => e.caseId === resolution.id || e.type === "requirement.created" || e.type === "SUPPLIER_CONTACT_AVOIDED"), resolution.id);
  }

  if (plan.strategy === "authorization_only") {
    recordContactAvoided(state, {
      requirementId: requirement.id,
      caseId: resolution.id,
      supplierActorId: resolution.currentActorId,
      avoidedBy: "AUTHORIZATION_ONLY",
      claimId: plan.candidateClaimId,
      timestamp: iso(now),
    });
    resolution.state = "AUTHORIZATION_REQUIRED";
    fail(state, resolution, "AUTHORIZATION_REQUIRED", now, {
      nextAction: "Ask the supplier for a one-click grant.",
      nextActionAt: addDays(now, 3),
    });
    emit({
      type: "permission.requested",
      caseId: resolution.id,
      actor: "SOURCE_SYSTEM",
      timestamp: iso(now),
      detail: "Reusable claim found. Authorization still required.",
    });
    emit({
      type: "SUPPLIER_CONTACT_AVOIDED",
      caseId: resolution.id,
      actor: "SOURCE_SYSTEM",
      timestamp: iso(now),
      detail: plan.reason,
      payload: { avoidedBy: "AUTHORIZATION_ONLY" },
    });
    return done(state, state.events.filter((e) => e.caseId === resolution.id || e.type === "requirement.created"), resolution.id);
  }

  if (plan.strategy === "same_org_reuse" && plan.candidateEvidenceId && plan.candidateClaimId) {
    const sourceClaim = state.claims.find((c) => c.id === plan.candidateClaimId);
    const evidence = state.evidence.find((e) => e.id === plan.candidateEvidenceId);
    if (sourceClaim && evidence) {
      applyExistingEvidenceToCase(state, resolution, evidence, sourceClaim, now, emit, "SAME_TENANT_REUSE");
      recordContactAvoided(state, {
        requirementId: requirement.id,
        caseId: resolution.id,
        supplierActorId: resolution.currentActorId,
        avoidedBy: "EXISTING_CLAIM",
        claimId: sourceClaim.id,
        evidenceId: evidence.id,
        timestamp: iso(now),
      });
      emit({
        type: "evidence.reused",
        caseId: resolution.id,
        actor: "SOURCE_SYSTEM",
        timestamp: iso(now),
        detail: "Compatible organisation-scoped evidence was reused without asking again.",
        payload: { evidenceId: evidence.id, sourceClaimId: sourceClaim.id },
      });
    }
    if (caseById(state, resolution.id).state === "READY") {
      return done(state, state.events.filter((e) => e.caseId === resolution.id || e.type === "requirement.created" || e.type === "evidence.reused"), resolution.id);
    }
  }

  if (plan.strategy === "reuse_consent_required" && plan.candidateEvidenceId && plan.candidateClaimId) {
    const sourceClaim = state.claims.find((c) => c.id === plan.candidateClaimId);
    const evidence = state.evidence.find((e) => e.id === plan.candidateEvidenceId);
    if (sourceClaim && evidence) {
      const consent = upsertReuseConsent(state, resolution, evidence, sourceClaim, now, emit);
      if (consent.status === "DECLINED") {
        // Fall through to a normal supplier request.
      } else if (consent.status === "APPROVED") {
        applyExistingEvidenceToCase(state, resolution, evidence, sourceClaim, now, emit, "SAME_TENANT_REUSE");
        return done(state, state.events.filter((e) => e.caseId === resolution.id || e.type === "requirement.created"), resolution.id);
      } else {
        resolution.state = "AUTHORIZATION_REQUIRED";
        fail(state, resolution, "REUSE_CONSENT_REQUIRED", now, {
          nextAction: "Ask the supplier whether this existing evidence may be used for this request.",
          nextActionAt: addDays(now, 3),
        });
        emit({
          type: "reuse.consent_requested",
          caseId: resolution.id,
          actor: "SOURCE_SYSTEM",
          timestamp: iso(now),
          detail: "Existing evidence may be relevant. Waiting for supplier reuse permission.",
          payload: { consentId: consent.id, evidenceId: evidence.id },
        });
        ensureOpenTask(state, now, {
          caseId: resolution.id,
          title: "Waiting for supplier reuse permission.",
          context: "SOURCE recognised previously supplied evidence as potentially relevant. Recognition is not permission.",
          recommendedAction: "The supplier must allow reuse for this request, or provide new evidence.",
          ownerLabel: "Supplier",
          kind: "reuse",
        });
        if (!command.planOnly) sendRequest(state, resolution.id, now, emit);
        return done(state, state.events.filter((e) => e.caseId === resolution.id || e.type === "requirement.created"), resolution.id);
      }
    }
  }

  if (plan.strategy === "existing_evidence" || plan.strategy === "internal_document_candidate") {
    resolution.state = "VALIDATING";
    resolution.nextAction = plan.reason;
    return done(state, state.events.filter((e) => e.caseId === resolution.id || e.type === "requirement.created"), resolution.id);
  }

  if (plan.strategy === "cross_product_compatible") {
    resolution.state = "SEARCHING_EXISTING_DATA";
    resolution.nextAction = plan.reason;
    state.tasks.push({
      id: id(state, "task"),
      caseId: resolution.id,
      title: "Review whether a related claim applies here.",
      context: plan.reason,
      recommendedAction: "Confirm scope before reuse. Similar is not identical.",
      ownerLabel: "Evidence reviewer",
      status: "open",
      createdAt: iso(now),
      kind: "review",
    });
    return done(state, state.events.filter((e) => e.caseId === resolution.id || e.type === "requirement.created"), resolution.id);
  }

  resolution.state = "ROUTING";
  if (plan.strategy === "alternative_contact") {
    resolution.state = "CONTACT_REQUIRED";
    resolution.nextAction = plan.reason;
    resolution.ownerLabel = "Account owner";
    ensureOpenTask(state, now, {
      caseId: resolution.id,
      title: "This supplier has no working contact yet.",
      context: plan.reason,
      recommendedAction: "Add an email SOURCE may use, or mark the contact as do-not-contact.",
      ownerLabel: "Account owner",
      kind: "contact",
    });
    return done(state, state.events.filter((e) => e.caseId === resolution.id || e.type === "requirement.created"), resolution.id);
  }

  if (!resolution.currentActorId || plan.strategy === "human_review") {
    resolution.state = "REVIEW_ROUTING";
    resolution.nextAction = plan.reason || "We found the missing requirement but don't yet know which supplier is responsible.";
    ensureOpenTask(state, now, {
      caseId: resolution.id,
      title: resolution.currentActorId
        ? "Review routing before SOURCE contacts a supplier."
        : "We don't yet know which supplier is responsible.",
      context: resolution.nextAction,
      recommendedAction: resolution.currentActorId
        ? "Confirm the supplier or assign the requirement before outreach."
        : "Identify the responsible supplier, or keep this as a Needs You item.",
      ownerLabel: "Identity reviewer",
      kind: "review",
    });
    return done(state, state.events.filter((e) => e.caseId === resolution.id || e.type === "requirement.created"), resolution.id);
  }

  if (plan.strategy === "explained_unresolved") {
    resolution.state = "UNRESOLVED";
    resolution.nextAction = plan.reason;
    resolution.resolutionOutcome = "UNRESOLVED";
    ensureOpenTask(state, now, {
      caseId: resolution.id,
      title: "This requirement is blocked.",
      context: plan.reason,
      recommendedAction: "Keep the case visible. Do not pretend it is resolved.",
      ownerLabel: "Compliance",
      kind: "review",
    });
    return done(state, state.events.filter((e) => e.caseId === resolution.id || e.type === "requirement.created"), resolution.id);
  }

  if (command.planOnly) {
    resolution.state = "DETECTED";
    resolution.nextAction = "SOURCE will attempt this after you let it handle the gaps.";
    return done(state, state.events.filter((e) => e.caseId === resolution.id || e.type === "requirement.created"), resolution.id);
  }

  sendRequest(state, resolution.id, now, emit);
  return done(state, state.events.filter((e) => e.caseId === resolution.id || e.type === "requirement.created"), resolution.id);
}

function sendRequest(
  state: EngineState,
  caseId: string,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void,
  contactId?: string
) {
  const resolution = caseById(state, caseId);
  const requirement = requirementOf(state, resolution);
  const plan = planResolution(
    gatherPlannerInput({
      state,
      requirement,
      identityMatched: resolution.identityStatus === "IDENTITY_MATCHED",
      identityNeedsReview: false,
      declaredSupplierId: resolution.currentActorId,
      now,
    })
  );
  if (plan.strategy === "exact_trusted_claim" && plan.candidateClaimId) {
    const claim = state.claims.find((c) => c.id === plan.candidateClaimId);
    if (claim) {
      recordContactAvoided(state, {
        requirementId: requirement.id,
        caseId,
        supplierActorId: resolution.currentActorId,
        avoidedBy: "CONCURRENT_RESOLUTION",
        claimId: claim.id,
        timestamp: iso(now),
      });
      emit({
        type: "SUPPLIER_CONTACT_AVOIDED",
        caseId,
        actor: "SOURCE_SYSTEM",
        timestamp: iso(now),
        detail: "A valid compatible claim existed before send.",
        payload: { avoidedBy: "CONCURRENT_RESOLUTION" },
      });
      markReady(state, resolution, claim, now, emit, "Existing claim reused without a new request.", "EXISTING_CLAIM");
      return;
    }
  }
  if (plan.strategy === "authorization_only") {
    recordContactAvoided(state, {
      requirementId: requirement.id,
      caseId,
      supplierActorId: resolution.currentActorId,
      avoidedBy: "AUTHORIZATION_ONLY",
      claimId: plan.candidateClaimId,
      timestamp: iso(now),
    });
    resolution.state = "AUTHORIZATION_REQUIRED";
    emit({
      type: "SUPPLIER_CONTACT_AVOIDED",
      caseId,
      actor: "SOURCE_SYSTEM",
      timestamp: iso(now),
      detail: plan.reason,
      payload: { avoidedBy: "AUTHORIZATION_ONLY" },
    });
    return;
  }
  if (plan.strategy === "same_org_reuse" && plan.candidateEvidenceId && plan.candidateClaimId) {
    const sourceClaim = state.claims.find((c) => c.id === plan.candidateClaimId);
    const evidence = state.evidence.find((e) => e.id === plan.candidateEvidenceId);
    if (sourceClaim && evidence) {
      applyExistingEvidenceToCase(state, resolution, evidence, sourceClaim, now, emit, "SAME_TENANT_REUSE");
    }
    if (resolution.state === "READY") return;
  }
  const actorId = resolution.currentActorId;
  if (!actorId) return;
  const contacts = state.contacts.filter((c) => c.actorId === actorId);
  const contact = (contactId ? contacts.find((c) => c.id === contactId) : pickContact(contacts)) ?? contacts.find((c) => c.valid);
  const request: SupplierRequest = {
    id: id(state, "req"),
    caseId,
    supplierId: actorId,
    supplierName: state.actors.find((a) => a.id === actorId)?.name ?? actorId,
    status: "SENT",
    sentAt: iso(now),
    dueAt: addDays(now, 14),
    lastActivityAt: iso(now),
    contactId: contact?.id,
    reminderCount: 0,
    executedEscalationActions: ["send"],
    portalToken: resolution.portalToken ?? caseId,
  };
  state.requests.push(request);
  const attempt: ResolutionAttempt = {
    id: id(state, "att"),
    caseId,
    actorId,
    method: "email_request",
    status: "waiting",
    startedAt: iso(now),
    costEstimate: 2.4,
    contactId: contact?.id,
    requestId: request.id,
  };
  state.attempts.push(attempt);
  resolution.currentAttemptId = attempt.id;
  resolution.requestId = request.id;
  resolution.state = "WAITING_RESPONSE";
  resolution.nextAction = "Automatic reminder";
  resolution.nextActionAt = addDays(now, 3);
  resolution.version += 1;
  const pendingReuse = state.reuseConsents.find((row) => row.caseId === caseId && row.status === "PENDING");
  if (pendingReuse) {
    const copy = explainException("REUSE_CONSENT_REQUIRED");
    resolution.blockingReason = "REUSE_CONSENT_REQUIRED";
    resolution.blockingExplanation = copy.reason;
    resolution.nextAction = copy.nextAction;
  } else {
    fail(state, resolution, "NO_RESPONSE", now, {
      nextAction: "Automatic reminder",
      nextActionAt: addDays(now, 3),
      ownerLabel: resolution.ownerLabel ?? "Procurement",
    });
  }
  emit({
    type: "request.sent",
    caseId,
    actor: "SOURCE_SYSTEM",
    timestamp: iso(now),
    policy: STANDARD_SUPPLIER_14D.id,
    policyVersion: STANDARD_SUPPLIER_14D.version,
    detail: `Request sent to ${request.supplierName}.`,
  });
}

function tickNoResponse(
  state: EngineState,
  caseId: string,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const resolution = caseById(state, caseId);
  const request = state.requests.find((r) => r.id === resolution.requestId);
  if (!request?.sentAt) return;
  const policy = state.policies.find((p) => p.id === resolution.escalationPolicyId) ?? STANDARD_SUPPLIER_14D;
  const pending = nextPendingStep(policy, new Date(request.sentAt), now, request.executedEscalationActions);
  if (!pending || pending.action === "send") return;

  if (pending.action === "friendly_reminder" || pending.action === "reminder_due") {
    sendReminder(state, caseId, now, emit, true, pending.action);
    return;
  }
  if (pending.action === "secondary_contact") {
    request.executedEscalationActions.push(pending.action);
    const other = state.contacts.find(
      (c) => c.actorId === resolution.currentActorId && c.valid && c.id !== request.contactId
    );
    if (other) {
      changeContact(state, caseId, other.id, now, emit);
    } else {
      resolution.nextAction = "No secondary contact. Escalate to procurement.";
    }
    emit({
      type: "request.secondary_contact",
      caseId,
      actor: "SOURCE_SYSTEM",
      timestamp: iso(now),
      policy: policy.id,
      policyVersion: policy.version,
      detail: pending.label,
    });
    return;
  }
  if (pending.action === "escalate_procurement") {
    request.executedEscalationActions.push(pending.action);
    escalate(state, caseId, now, emit);
    return;
  }
  if (pending.action === "mark_non_responsive") {
    request.executedEscalationActions.push(pending.action);
    request.status = "NO_RESPONSE";
    fail(state, resolution, "NO_RESPONSE", now, {
      state: "UNRESOLVED",
      nextAction: "Mark unresolved or try a new contact.",
      ownerLabel: "Procurement",
    });
    emit({
      type: "request.no_response",
      caseId,
      actor: "SOURCE_SYSTEM",
      timestamp: iso(now),
      policy: policy.id,
      policyVersion: policy.version,
      detail: "Supplier marked non-responsive after policy exhaustion.",
    });
  }
}

function sendReminder(
  state: EngineState,
  caseId: string,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void,
  automatic: boolean,
  action = "friendly_reminder"
) {
  const resolution = caseById(state, caseId);
  const request = state.requests.find((r) => r.id === resolution.requestId);
  if (!request) return;
  if (automatic && request.executedEscalationActions.includes(action)) return;
  request.executedEscalationActions.push(action);
  request.reminderCount += 1;
  request.lastActivityAt = iso(now);
  request.status = "NO_RESPONSE";
  const policy = state.policies.find((p) => p.id === resolution.escalationPolicyId) ?? STANDARD_SUPPLIER_14D;
  const next = upcomingStep(policy, new Date(request.sentAt ?? iso(now)), now, request.executedEscalationActions);
  resolution.nextAction = next?.label ?? "Escalate to procurement owner";
  resolution.nextActionAt = next ? addDays(new Date(request.sentAt ?? iso(now)), next.day) : addDays(now, 4);
  resolution.version += 1;
  state.attempts.push({
    id: id(state, "att"),
    caseId,
    actorId: resolution.currentActorId ?? request.supplierId,
    method: "email_request",
    status: "waiting",
    startedAt: iso(now),
    costEstimate: 0.01,
    requestId: request.id,
  });
  emit({
    type: "AUTO_REMINDER_SENT",
    caseId,
    actor: "SOURCE_SYSTEM",
    timestamp: iso(now),
    policy: policy.id,
    policyVersion: policy.version,
    detail: automatic
      ? `Automatic ${action.replaceAll("_", " ")} according to ${policy.id}.`
      : "Manual reminder sent.",
    payload: { trigger: automatic ? "threshold" : "manual", action },
  });
}

function escalate(
  state: EngineState,
  caseId: string,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const resolution = caseById(state, caseId);
  resolution.ownerLabel = "John — Procurement";
  resolution.nextAction = "Procurement follows up with the supplier.";
  resolution.nextActionAt = addDays(now, 2);
  resolution.automationLevel = "L0";
  resolution.version += 1;
  state.tasks.push({
    id: id(state, "task"),
    caseId,
    title: `Supplier has not responded. Follow up on ${requirementOf(state, resolution).propertyLabel}.`,
    context: `${resolution.id} is waiting. Reminders already sent.`,
    recommendedAction: "Call the account contact or change the recipient.",
    ownerLabel: "John — Procurement",
    status: "open",
    createdAt: iso(now),
    kind: "escalation",
  });
  state.attempts.push({
    id: id(state, "att"),
    caseId,
    actorId: resolution.currentActorId ?? "procurement",
    method: "procurement_escalation",
    status: "open",
    startedAt: iso(now),
    costEstimate: 18,
  });
  emit({
    type: "case.escalated",
    caseId,
    actor: "SOURCE_SYSTEM",
    timestamp: iso(now),
    policy: resolution.escalationPolicyId,
    detail: "Escalated to procurement owner.",
  });
}

function changeContact(
  state: EngineState,
  caseId: string,
  contactId: string,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const resolution = caseById(state, caseId);
  const request = state.requests.find((r) => r.id === resolution.requestId);
  if (request) {
    request.contactId = contactId;
    request.status = "SENT";
    request.lastActivityAt = iso(now);
  }
  resolution.state = "WAITING_RESPONSE";
  resolution.nextAction = "Wait for the new contact to answer.";
  emit({
    type: "request.contact_changed",
    caseId,
    actor: "SOURCE_SYSTEM",
    timestamp: iso(now),
    detail: `Request redirected to contact ${contactId}. Same case.`,
  });
}

function markBounce(
  state: EngineState,
  caseId: string,
  contactId: string,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const resolution = caseById(state, caseId);
  const contact = state.contacts.find((c) => c.id === contactId);
  if (contact) contact.valid = false;
  const request = state.requests.find((r) => r.id === resolution.requestId);
  if (request) request.status = "BOUNCED";
  const other = state.contacts.find(
    (c) => c.actorId === resolution.currentActorId && c.valid && c.id !== contactId
  );
  emit({
    type: "request.bounced",
    caseId,
    actor: "SOURCE_SYSTEM",
    timestamp: iso(now),
    detail: "Contact marked invalid after bounce. SOURCE will not wait for the deadline.",
  });
  if (other) {
    changeContact(state, caseId, other.id, now, emit);
    return;
  }
  resolution.state = "CONTACT_REQUIRED";
  fail(state, resolution, "CONTACT_REQUIRED", now, {
    nextAction: "Account owner supplies a working contact.",
    ownerLabel: "Account owner",
  });
  state.tasks.push({
    id: id(state, "task"),
    caseId,
    title: "We couldn't reach this supplier",
    context: `${state.actors.find((a) => a.id === resolution.currentActorId)?.name ?? "This supplier"}\nThe email was rejected by the recipient's mail server. This is not supplier non-response.`,
    recommendedAction: "Add another contact",
    ownerLabel: "Account owner",
    status: "open",
    createdAt: iso(now),
    kind: "contact",
  });
}

function markWrongContact(
  state: EngineState,
  command: Extract<Command, { type: "MARK_WRONG_CONTACT" }>,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const resolution = caseById(state, command.caseId);
  const request = state.requests.find((r) => r.id === resolution.requestId);
  if (request) request.status = "WRONG_CONTACT";
  const previous = request?.contactId;
  fail(state, resolution, "WRONG_CONTACT", now, {
    state: "WAITING_RESPONSE",
    nextAction: "Same scoped request continues to the new person.",
  });
  if (command.mode === "provide_contact" && command.contact && resolution.currentActorId) {
    const created: ContactPoint = {
      id: id(state, "ct"),
      actorId: resolution.currentActorId,
      valid: true,
      ...command.contact,
    };
    state.contacts.push(created);
    changeContact(state, command.caseId, created.id, now, emit);
  }
  emit({
    type: "request.forwarded",
    caseId: command.caseId,
    actor: previous ?? "supplier",
    timestamp: iso(now),
    detail: `Wrong contact. Original recipient ${previous ?? "unknown"} remains in audit history.`,
  });
}

function markUnknown(
  state: EngineState,
  caseId: string,
  choice: "ask_supplier" | "assign_colleague" | "do_not_have" | "does_not_exist",
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const resolution = caseById(state, caseId);
  const request = state.requests.find((r) => r.id === resolution.requestId);
  if (request) request.status = "UNKNOWN_INFORMATION";
  emit({
    type: "request.unknown",
    caseId,
    actor: resolution.currentActorId ?? "supplier",
    timestamp: iso(now),
    detail: `Supplier selected ${choice}. This is a primary SOURCE flow, not a failure.`,
  });
  if (choice === "ask_supplier") {
    resolution.state = "WAITING_UPSTREAM";
    fail(state, resolution, "UPSTREAM_REQUIRED", now, {
      nextAction: "Supplier names who supplies this component.",
    });
    return;
  }
  if (choice === "does_not_exist" || choice === "do_not_have") {
    fail(state, resolution, choice === "does_not_exist" ? "UNRESOLVABLE" : "UNKNOWN", now, {
      state: choice === "does_not_exist" ? "UNRESOLVED" : "WAITING_RESPONSE",
      nextAction:
        choice === "does_not_exist"
          ? "Keep UNRESOLVED. The chain does not possess this information."
          : "Assign a colleague or ask the supplier's supplier.",
    });
    if (choice === "does_not_exist") {
      resolution.resolutionOutcome = "UNRESOLVED";
      resolution.closedAt = iso(now);
    }
    return;
  }
}

function forwardUpstream(
  state: EngineState,
  command: Extract<Command, { type: "FORWARD_UPSTREAM" }>,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const resolution = caseById(state, command.caseId);
  const fromId = resolution.currentActorId;
  if (!fromId) return;

  let upstream = command.upstream.id ? state.actors.find((a) => a.id === command.upstream.id) : undefined;
  if (!upstream) {
    upstream = {
      id: command.upstream.id ?? id(state, "act"),
      name: command.upstream.name,
      legalName: command.upstream.legalName,
      kind: "organisation",
      country: command.upstream.country,
      confidential: command.mode === "confidential",
    };
    state.actors.push(upstream);
  }

  const depth = state.attempts.filter((a) => a.caseId === command.caseId && a.forwardedUpstream).length;
  if (depth >= 8) {
    fail(state, resolution, "UNRESOLVABLE", now, { state: "UNRESOLVED", nextAction: "Maximum upstream depth reached." });
    return;
  }

  if (wouldCreateCycle(state.relationships, fromId, upstream.id)) {
    resolution.state = "UNRESOLVED";
    fail(state, resolution, "CHAIN_CYCLE", now, {
      nextAction: "Human review. No new request is sent.",
      ownerLabel: "Graph reviewer",
    });
    state.tasks.push({
      id: id(state, "task"),
      caseId: command.caseId,
      title: "Supply-chain cycle detected. Review relationships before asking anyone.",
      context: `${fromId} → ${upstream.id} would loop.`,
      recommendedAction: "Correct the graph. Do not send a new request.",
      ownerLabel: "Graph reviewer",
      status: "open",
      createdAt: iso(now),
      kind: "review",
    });
    emit({
      type: "case.unresolved",
      caseId: command.caseId,
      actor: "SOURCE_SYSTEM",
      timestamp: iso(now),
      detail: "SUPPLY_CHAIN_CYCLE. No new request.",
    });
    return;
  }

  const requirement = requirementOf(state, resolution);
  state.relationships.push({
    id: id(state, "rel"),
    fromActorId: fromId,
    toActorId: upstream.id,
    subjectId: requirement.subjectId,
    confidentialUpstream: command.mode === "confidential",
    confidentialDownstream: command.mode === "confidential",
    hideCustomer: command.mode !== "on_behalf",
  });

  const parent = resolution.currentAttemptId;
  const attempt: ResolutionAttempt = {
    id: id(state, "att"),
    caseId: command.caseId,
    actorId: upstream.id,
    method: "upstream_request",
    status: "waiting",
    startedAt: iso(now),
    parentAttemptId: parent,
    forwardedUpstream: true,
    costEstimate: 2.4,
  };
  state.attempts.push(attempt);
  resolution.currentAttemptId = attempt.id;
  resolution.currentActorId = upstream.id;
  resolution.state = "WAITING_UPSTREAM";
  resolution.version += 1;
  const request = state.requests.find((r) => r.id === resolution.requestId);
  if (request) request.status = "NEEDS_UPSTREAM";
  fail(
    state,
    resolution,
    command.mode === "confidential" ? "CONFIDENTIAL" : "UPSTREAM_REQUIRED",
    now,
    {
      nextAction: "Wait for the upstream supplier. Original requirement stays the same.",
    }
  );
  emit({
    type: "request.forwarded",
    caseId: command.caseId,
    actor: fromId,
    timestamp: iso(now),
    detail:
      command.mode === "confidential"
        ? "Forwarded upstream with identity protected."
        : "Forwarded upstream. Same InformationRequirement.",
    payload: {
      hideCustomer: command.mode !== "on_behalf",
      confidential: command.mode === "confidential",
    },
  });
}

function decline(
  state: EngineState,
  command: Extract<Command, { type: "DECLINE" }>,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const resolution = caseById(state, command.caseId);
  const request = state.requests.find((r) => r.id === resolution.requestId);
  if (request) request.status = command.reason === "legal_restriction" ? "LEGAL_RESTRICTION" : "DECLINED";

  if (command.reason === "legal_restriction") {
    fail(state, resolution, "LEGAL_RESTRICTION", now, {
      state: "UNRESOLVED",
      nextAction: "Review with legal. Do not auto-propagate.",
    });
  } else if (command.reason === "contract_restriction" || command.reason === "no_permission") {
    resolution.state = "NDA_REQUIRED";
    fail(state, resolution, "NDA_REQUIRED", now, {
      nextAction: "Confirm whether an agreement already exists, then resume.",
      ownerLabel: "Tenant owner",
    });
    state.tasks.push({
      id: id(state, "task"),
      caseId: command.caseId,
      title: "Supplier declined due to NDA. Confirm agreement exists.",
      context: command.note ?? "SOURCE does not assume an NDA exists.",
      recommendedAction: "Confirm agreement metadata, then resume disclosure.",
      ownerLabel: "Tenant owner",
      status: "open",
      createdAt: iso(now),
      kind: "nda",
    });
  } else if (command.reason === "information_unavailable" || command.reason === "no_longer_supplied") {
    closeUnresolved(state, command.caseId, command.note ?? command.reason, now, emit);
    return;
  } else {
    fail(state, resolution, "DECLINED", now, {
      state: "ROUTING",
      nextAction: "Try another actor or keep the case open with this reason.",
      blockingExplanation: command.note ?? explainException("DECLINED").reason,
    });
  }
  emit({
    type: "request.declined",
    caseId: command.caseId,
    actor: resolution.currentActorId ?? "supplier",
    timestamp: iso(now),
    detail: `Declined: ${command.reason}.`,
  });
}

function acceptEvidenceDisclosure(
  state: EngineState,
  command: Extract<Command, { type: "ACCEPT_EVIDENCE_DISCLOSURE" }>,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  if (command.authorityConfirmed !== true) {
    throw new EngineValidationError(
      "AUTHORITY_NOT_CONFIRMED",
      "Confirm that you are authorised to provide this information before continuing."
    );
  }
  if (command.termsAccepted !== true) {
    throw new EngineValidationError(
      "TERMS_NOT_ACCEPTED",
      "Read and accept the Data Disclosure Terms before continuing."
    );
  }
  const current = currentDataDisclosureTerms();
  if (command.agreementId !== current.agreementId || command.agreementVersion !== current.version) {
    throw new EngineValidationError(
      "TERMS_VERSION_MISMATCH",
      "The Data Disclosure Terms shown on this request have changed. Review the current terms."
    );
  }
  const terms = dataDisclosureTermsByVersion(command.agreementVersion);
  if (!terms || terms.hash !== current.hash) {
    throw new EngineValidationError("TERMS_VERSION_MISMATCH", "Unknown Data Disclosure Terms version.");
  }

  const resolution = caseById(state, command.caseId);
  const requirement = requirementOf(state, resolution);
  const supplierId = resolution.currentActorId;
  const existing = state.disclosureAcceptances.find((row) => {
    if (!row.authorityConfirmed || !row.termsAccepted || row.agreementVersion !== terms.version) return false;
    if (command.portalGrantId) return row.grantId === command.portalGrantId;
    return row.supplierId === supplierId && row.requestingOrganisationId === state.tenant.id;
  });
  if (existing) {
    emit({
      type: "disclosure.acceptance_replayed",
      caseId: command.caseId,
      actor: command.acceptedBy ?? supplierId ?? "supplier",
      timestamp: iso(now),
      detail: `Existing acceptance ${existing.agreementVersion} reused. Historical record was not changed.`,
      payload: { acceptanceId: existing.id, agreementVersion: existing.agreementVersion },
    });
    return;
  }

  const scopeCaseIds = uniqueIds([
    command.caseId,
    ...state.cases
      .filter((item) => item.currentActorId && item.currentActorId === supplierId)
      .map((item) => item.id),
  ]);
  const scopeProductIds = uniqueIds(
    state.requirements
      .filter((item) => scopeCaseIds.includes(item.linkedCaseId ?? ""))
      .flatMap((item) => item.productIds)
  );
  const acceptedBy = command.acceptedBy ?? supplierId ?? "supplier";
  const record: DisclosureAgreementAcceptance = {
    id: id(state, "acc"),
    grantId: command.portalGrantId,
    requestId: command.portalGrantId ?? resolution.requestId,
    supplierId,
    requestingOrganisationId: state.tenant.id,
    purpose: requirement.purpose,
    scopeCaseIds,
    scopeProductIds,
    agreementId: terms.agreementId,
    agreementVersion: terms.version,
    termsHash: terms.hash,
    authorityConfirmed: true,
    authorityConfirmedAt: iso(now),
    authorityConfirmedBy: acceptedBy,
    termsAccepted: true,
    acceptedAt: iso(now),
    acceptedBy,
    reusePolicy: command.reusePolicy ?? "NO_REUSE",
    createdAt: iso(now),
  };
  state.disclosureAcceptances.push(record);
  emit({
    type: "authority.confirmed",
    caseId: command.caseId,
    actor: acceptedBy,
    timestamp: iso(now),
    detail: "Supplier confirmed they are authorised to provide this information.",
    payload: {
      acceptanceId: record.id,
      supplierId: record.supplierId ?? "",
      requestingOrganisationId: record.requestingOrganisationId,
    },
  });
  emit({
    type: "disclosure.terms_accepted",
    caseId: command.caseId,
    actor: acceptedBy,
    timestamp: iso(now),
    detail: `Data Disclosure Terms ${terms.version} accepted.`,
    payload: {
      acceptanceId: record.id,
      agreementId: terms.agreementId,
      agreementVersion: terms.version,
      termsHash: terms.hash,
      purpose: record.purpose,
      reusePolicy: record.reusePolicy,
    },
  });
}

function matchingDisclosureAcceptance(
  state: EngineState,
  command: Extract<Command, { type: "SUBMIT_RESPONSE" }>,
  caseIds: string[]
): DisclosureAgreementAcceptance {
  const current = currentDataDisclosureTerms();
  const resolution = caseById(state, command.caseId);
  let acceptance = command.disclosureAcceptanceId
    ? state.disclosureAcceptances.find((row) => row.id === command.disclosureAcceptanceId)
    : undefined;
  if (!acceptance && command.portalGrantId) {
    acceptance = state.disclosureAcceptances.find(
      (row) =>
        row.grantId === command.portalGrantId &&
        row.agreementVersion === current.version &&
        row.authorityConfirmed &&
        row.termsAccepted
    );
  }
  if (!acceptance) {
    acceptance = state.disclosureAcceptances.find(
      (row) =>
        row.supplierId === resolution.currentActorId &&
        row.requestingOrganisationId === state.tenant.id &&
        row.agreementVersion === current.version &&
        row.authorityConfirmed &&
        row.termsAccepted
    );
  }
  if (!acceptance || !acceptance.authorityConfirmed || !acceptance.termsAccepted) {
    const priorForGrant = command.portalGrantId
      ? state.disclosureAcceptances.some(
          (row) => row.grantId === command.portalGrantId && row.authorityConfirmed && row.termsAccepted
        )
      : state.disclosureAcceptances.some(
          (row) =>
            row.supplierId === resolution.currentActorId &&
            row.requestingOrganisationId === state.tenant.id &&
            row.authorityConfirmed &&
            row.termsAccepted
        );
    throw new EngineValidationError(
      priorForGrant ? "TERMS_VERSION_MISMATCH" : "DISCLOSURE_NOT_ACCEPTED",
      priorForGrant
        ? "The Data Disclosure Terms have been updated. Review and accept the current version."
        : "Confirm authorisation and accept the Data Disclosure Terms before submitting evidence."
    );
  }
  if (acceptance.agreementVersion !== current.version) {
    throw new EngineValidationError(
      "TERMS_VERSION_MISMATCH",
      "The Data Disclosure Terms have been updated. Review and accept the current version."
    );
  }
  if (acceptance.requestingOrganisationId !== state.tenant.id) {
    throw new EngineValidationError("SCOPE_FORGERY", "This acceptance does not belong to this request.");
  }
  for (const caseId of caseIds) {
    if (!acceptance.scopeCaseIds.includes(caseId)) {
      throw new EngineValidationError(
        "SCOPE_FORGERY",
        "Evidence can only be submitted for the request scope that was accepted."
      );
    }
  }
  return acceptance;
}

function uniqueIds(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function submitResponse(
  state: EngineState,
  command: Extract<Command, { type: "SUBMIT_RESPONSE" }>,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const targetCaseIds = uniqueIds([command.caseId, ...(command.supportsCaseIds ?? [])]);
  const disclosureV1 = Boolean(command.evidenceRoute);
  const acceptance = disclosureV1 ? matchingDisclosureAcceptance(state, command, targetCaseIds) : undefined;
  const reusePolicy = disclosureV1
    ? (command.reusePolicy ?? defaultEvidenceReusePolicy(acceptance?.reusePolicy))
    : command.reusePolicy;
  if (reusePolicy !== undefined) command = { ...command, reusePolicy };

  if (disclosureV1) {
    if (reusePolicy && !isSupportedReusePolicy(reusePolicy)) {
      throw new EngineValidationError("REUSE_POLICY_UNSUPPORTED", "That reuse choice is not supported.");
    }
    if (reusePolicy && acceptance && reuseRank(reusePolicy) > reuseRank(acceptance.reusePolicy)) {
      throw new EngineValidationError(
        "REUSE_NOT_PERMITTED",
        "Reuse cannot exceed the policy accepted with the Data Disclosure Terms."
      );
    }
    if (
      (command.evidenceRoute === "CANNOT_PROVIDE" || command.disclosureMode === "CANNOT_DISCLOSE") &&
      command.evidenceRoute !== "CANNOT_PROVIDE"
    ) {
      throw new EngineValidationError(
        "DISCLOSURE_ROUTE_MISMATCH",
        "Cannot-disclose applies only when evidence is not supplied."
      );
    }
    if (command.evidenceRoute === "CANNOT_PROVIDE" || command.disclosureMode === "CANNOT_DISCLOSE") {
      for (const caseId of targetCaseIds) {
        recordCannotProvide(state, { ...command, caseId }, acceptance!, now, emit);
      }
      return;
    }
    if (!command.disclosureMode) {
      throw new EngineValidationError("DISCLOSURE_MODE_REQUIRED", "Choose how this evidence may be disclosed.");
    }
    if (documentaryRoute(command.evidenceRoute) && !command.evidence) {
      throw new EngineValidationError(
        "EVIDENCE_FILE_REQUIRED",
        "Upload original or alternative documentary evidence for this route."
      );
    }
    if (command.evidenceRoute === "SUPPLIER_ATTESTATION") {
      const attestation = command.attestation;
      if (
        !attestation?.legalEntity?.trim() ||
        !attestation.personName?.trim() ||
        !attestation.role?.trim() ||
        !attestation.statement?.trim()
      ) {
        throw new EngineValidationError(
          "ATTESTATION_INCOMPLETE",
          "An authorised declaration must name the organisation, person, role and statement."
        );
      }
    }
  }

  const primary = caseById(state, command.caseId);
  const request = state.requests.find((r) => r.id === primary.requestId);
  if (request) {
    request.status = "SUBMITTED";
    request.lastActivityAt = iso(now);
  }

  let evidence: EvidenceRecord | undefined;
  if (command.evidence || command.evidenceRoute === "SUPPLIER_ATTESTATION") {
    evidence = upsertEvidenceRecord(state, command, primary, acceptance, now, emit);
  }

  for (const caseId of targetCaseIds) {
    const perCase =
      caseId === command.caseId
        ? command
        : { ...command, caseId, value: valueForLinkedCase(state, command, caseId) };
    applySubmittedEvidenceToCase(state, perCase, evidence, now, emit, Boolean(disclosureV1));
    refreshReadinessCache(state, caseId);
  }
}

function valueForLinkedCase(
  state: EngineState,
  command: Extract<Command, { type: "SUBMIT_RESPONSE" }>,
  caseId: string
): string {
  const primary = requirementOf(state, caseById(state, command.caseId));
  const linked = requirementOf(state, caseById(state, caseId));
  if (primary.propertyId === linked.propertyId) return command.value;
  return "";
}

function upsertEvidenceRecord(
  state: EngineState,
  command: Extract<Command, { type: "SUBMIT_RESPONSE" }>,
  resolution: ResolutionCase,
  acceptance: DisclosureAgreementAcceptance | undefined,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
): EvidenceRecord {
  const requirement = requirementOf(state, resolution);
  const existing = command.evidence?.storageObjectId
    ? state.evidence.find((item) => item.storageObjectId === command.evidence?.storageObjectId)
    : undefined;
  const disclosureMode = command.disclosureMode;
  const visibility = disclosureMode
    ? mapDisclosureModeToEvidenceVisibility(disclosureMode)
    : command.visibility === "verification_only"
      ? "protected"
      : "private";
  const filename =
    command.evidence?.filename ??
    (command.evidenceRoute === "SUPPLIER_ATTESTATION" ? "Authorised supplier declaration" : "evidence");
  const malformed = Boolean(
    command.evidenceRoute &&
      documentaryRoute(command.evidenceRoute) &&
      command.evidence &&
      !command.evidence.extractedValue &&
      !command.value?.trim() &&
      !command.evidence.sha256 &&
      !command.evidence.storageObjectId
  );
  const classification = command.evidenceRoute
    ? classifyEvidenceStrength({
        route: command.evidenceRoute,
        hasFile: Boolean(command.evidence?.filename || command.evidence?.storageObjectId),
        issuerClass: command.issuerClass,
        malformed,
      })
    : undefined;

  const evidence =
    existing ??
    ({
      id: id(state, "ev"),
      filename,
      sha256: command.evidence?.sha256 ?? `sha-${state.seq}`,
      issuer: state.actors.find((a) => a.id === resolution.currentActorId)?.name ?? "Supplier",
      ownerActorId: resolution.currentActorId ?? "unknown",
      validUntil: addDays(now, 400),
      expired: false,
      scope: command.evidence?.scope ?? { kind: "product", id: requirement.subjectId, label: requirement.subjectLabel },
      visibility,
      linkedClaimIds: [],
      extractedValue: command.evidence?.extractedValue,
      extractionConfidence: command.evidence?.confidence,
      storageObjectId: command.evidence?.storageObjectId,
      mimeType: command.evidence?.mimeType,
      sizeBytes: command.evidence?.sizeBytes,
      availability:
        command.evidence?.availability ??
        (command.evidence?.storageObjectId || command.evidenceRoute === "SUPPLIER_ATTESTATION" ? "AVAILABLE" : undefined),
      supersedesEvidenceId: command.evidence?.supersedesEvidenceId,
      uploadedViaPortalGrantId: command.portalGrantId,
      createdAt: iso(now),
      route: command.evidenceRoute,
      disclosureMode,
      reusePolicy: command.reusePolicy ?? (command.evidenceRoute ? "ASK_FOR_REUSE" : undefined),
      disclosureAcceptanceId: acceptance?.id,
      agreementVersion: acceptance?.agreementVersion,
      issuerClass: command.issuerClass,
      attestation: command.attestation,
      strengthReason: classification?.reason,
    } satisfies EvidenceRecord);

  if (existing) {
    if (command.evidence?.scope) existing.scope = command.evidence.scope;
    if (command.evidence?.extractedValue) existing.extractedValue = command.evidence.extractedValue;
    if (command.evidence?.confidence !== undefined) existing.extractionConfidence = command.evidence.confidence;
    if (command.evidenceRoute && !existing.route) existing.route = command.evidenceRoute;
    if (disclosureMode && !existing.disclosureMode) existing.disclosureMode = disclosureMode;
    if (acceptance && !existing.disclosureAcceptanceId) {
      existing.disclosureAcceptanceId = acceptance.id;
      existing.agreementVersion = acceptance.agreementVersion;
    }
  } else {
    if (command.evidence?.supersedesEvidenceId) {
      const previous = state.evidence.find((item) => item.id === command.evidence?.supersedesEvidenceId);
      if (previous) previous.supersededByEvidenceId = evidence.id;
    }
    state.evidence.push(evidence);
  }

  emit({
    type: command.evidenceRoute === "SUPPLIER_ATTESTATION" ? "evidence.attestation_submitted" : "evidence.uploaded",
    caseId: command.caseId,
    actor: resolution.currentActorId ?? "supplier",
    timestamp: iso(now),
    detail: evidence.filename,
    payload: {
      evidenceId: evidence.id,
      route: command.evidenceRoute ?? "",
      disclosureMode: disclosureMode ?? "",
      reusePolicy: evidence.reusePolicy ?? "",
      agreementVersion: evidence.agreementVersion ?? "",
    },
  });
  return evidence;
}

function recordCannotProvide(
  state: EngineState,
  command: Extract<Command, { type: "SUBMIT_RESPONSE" }>,
  acceptance: DisclosureAgreementAcceptance,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const resolution = caseById(state, command.caseId);
  const requirement = requirementOf(state, resolution);
  const reason = command.cannotProvideReason ?? "other";
  state.cannotProvideResponses.push({
    id: id(state, "cnp"),
    caseId: command.caseId,
    grantId: command.portalGrantId,
    reason,
    note: command.value || undefined,
    disclosureAcceptanceId: acceptance.id,
    createdAt: iso(now),
    createdBy: resolution.currentActorId ?? "supplier",
  });
  const request = state.requests.find((r) => r.id === resolution.requestId);
  if (request) {
    request.status = reason === "another_party" ? "NEEDS_UPSTREAM" : "UNKNOWN_INFORMATION";
    request.lastActivityAt = iso(now);
  }
  const blocking: ExceptionCode =
    reason === "confidentiality" || reason === "commercially_sensitive"
      ? "CONFIDENTIAL"
      : reason === "another_party"
        ? "UPSTREAM_REQUIRED"
        : reason === "unavailable"
          ? "DECLINED"
          : "UNKNOWN";
  fail(state, resolution, blocking, now, {
    state: reason === "another_party" ? "WAITING_UPSTREAM" : "REVIEW_ROUTING",
    nextAction:
      reason === "another_party"
        ? "Identify the party that holds this evidence, or keep the case open."
        : "Supplier could not provide evidence. Choose an alternative route or keep this as Needs You.",
    ownerLabel: "Tenant owner",
  });
  state.tasks.push({
    id: id(state, "task"),
    caseId: command.caseId,
    title: "Supplier could not provide this evidence.",
    context: `Reason: ${reason.replaceAll("_", " ")}.`,
    recommendedAction: "Do not mark ready. Try another actor, an alternative evidence route, or keep the gap visible.",
    ownerLabel: "Tenant owner",
    status: "open",
    createdAt: iso(now),
    kind: "review",
  });
  recordAssessment(state, {
    caseId: command.caseId,
    requirementId: requirement.id,
    result: "INSUFFICIENT",
    reason: "The supplier could not provide evidence. The requirement stays open.",
    assessedAt: iso(now),
  });
  emit({
    type: "evidence.cannot_provide",
    caseId: command.caseId,
    actor: resolution.currentActorId ?? "supplier",
    timestamp: iso(now),
    detail: `Cannot provide: ${reason}.`,
    payload: {
      reason,
      disclosureMode: "CANNOT_DISCLOSE",
      agreementVersion: acceptance.agreementVersion,
    },
  });
}

function applySubmittedEvidenceToCase(
  state: EngineState,
  command: Extract<Command, { type: "SUBMIT_RESPONSE" }>,
  evidence: EvidenceRecord | undefined,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void,
  disclosureV1: boolean
) {
  const resolution = caseById(state, command.caseId);
  const requirement = requirementOf(state, resolution);
  if (evidence && evidence.linkedClaimIds.some((claimId) => state.claims.find((c) => c.id === claimId)?.caseId === command.caseId)) {
    return;
  }
  resolution.state = "RESPONSE_RECEIVED";

  const differentPropertyLinked = disclosureV1 && !command.value?.trim();
  const extracted = evidence?.extractedValue;
  if (extracted && command.value && extracted !== command.value) {
    const claim = writeClaim(state, resolution, requirement, command, evidence, now, "DECLARED");
    resolution.state = "CONFLICT";
    resolution.downstreamSyncBlocked = true;
    fail(state, resolution, "VALUE_EVIDENCE_CONFLICT", now, {
      nextAction: "Resolve the conflict. No downstream sync occurs until then.",
    });
    state.conflicts.push({
      id: id(state, "cf"),
      caseId: command.caseId,
      claimId: claim.id,
      leftLabel: "Declared value",
      leftValue: command.value,
      rightLabel: evidence?.filename ?? "Extracted evidence",
      rightValue: extracted,
    });
    state.tasks.push({
      id: id(state, "task"),
      caseId: command.caseId,
      title: "Two values conflict. Select the applicable evidence.",
      context: `Declared ${command.value} vs extracted ${extracted}.`,
      recommendedAction: "Do not pick automatically. Choose scope, facility, batch or withdraw.",
      ownerLabel: "Evidence reviewer",
      status: "open",
      createdAt: iso(now),
      kind: "conflict",
    });
    recordAssessment(state, {
      caseId: command.caseId,
      requirementId: requirement.id,
      evidenceId: evidence?.id,
      claimId: claim.id,
      result: "CONFLICTING",
      evidenceStrength: "DECLARED",
      reason: "Declared value and documentary extract disagree.",
      assessedAt: iso(now),
    });
    emit({
      type: "claim.conflict_detected",
      caseId: command.caseId,
      actor: "SOURCE_SYSTEM",
      timestamp: iso(now),
      detail: `Declared ${command.value} vs evidence ${extracted}.`,
    });
    return;
  }

  if (evidence && (evidence.extractionConfidence ?? 100) < 80) {
    const claim = writeClaim(state, resolution, requirement, command, evidence, now, "DECLARED");
    fail(state, resolution, "EXTRACTION_REVIEW_REQUIRED", now, {
      state: "VALIDATING",
      nextAction: "Review the extracted candidate. We may have found this information.",
    });
    recordAssessment(state, {
      caseId: command.caseId,
      requirementId: requirement.id,
      evidenceId: evidence.id,
      claimId: claim.id,
      result: "REVIEW_REQUIRED",
      evidenceStrength: "DECLARED",
      reason: "Extraction confidence is too low to treat as sufficient.",
      assessedAt: iso(now),
    });
    return;
  }

  const linkedBySupplier = (command.supportsCaseIds ?? []).includes(command.caseId);
  const scopeMatch = linkedBySupplier || evidenceScopeApplies(evidence, requirement.subjectId);
  if (evidence && !scopeMatch) {
    const claim = writeClaim(state, resolution, requirement, command, evidence, now, "DECLARED");
    fail(state, resolution, "SCOPE_MISMATCH", now, {
      state: "VALIDATING",
      nextAction: "Evidence is not in scope for this product. Do not promote to verified.",
    });
    recordAssessment(state, {
      caseId: command.caseId,
      requirementId: requirement.id,
      evidenceId: evidence.id,
      claimId: claim.id,
      result: "INSUFFICIENT",
      evidenceStrength: "DECLARED",
      reason: "Strong or documentary evidence may still be irrelevant to this requirement.",
      assessedAt: iso(now),
    });
    return;
  }

  let trust: ClaimRecord["trustLevel"] = evidence ? "EVIDENCED" : "DECLARED";
  if (disclosureV1) {
    const classified = classifyEvidenceStrength({
      route: command.evidenceRoute,
      hasFile: Boolean(evidence && evidence.route !== "SUPPLIER_ATTESTATION" && (evidence.storageObjectId || evidence.filename)),
      issuerClass: command.issuerClass ?? evidence?.issuerClass,
      relevant: scopeMatch,
      malformed:
        documentaryRoute(command.evidenceRoute) &&
        Boolean(evidence) &&
        !evidence?.extractedValue &&
        !command.value?.trim() &&
        !evidence?.storageObjectId,
    });
    trust = classified.trustLevel;
    if (evidence) evidence.strengthReason = classified.reason;
  }

  if (differentPropertyLinked && disclosureV1) {
    const claim = writeClaim(state, resolution, requirement, { ...command, value: command.value || "see evidence" }, evidence, now, trust);
    writePermission(state, claim, command, now);
    fail(state, resolution, "EXTRACTION_REVIEW_REQUIRED", now, {
      state: "VALIDATING",
      nextAction: "Documentary evidence is linked. Review whether it supports this requirement.",
    });
    recordAssessment(state, {
      caseId: command.caseId,
      requirementId: requirement.id,
      evidenceId: evidence?.id,
      claimId: claim.id,
      result: "REVIEW_REQUIRED",
      evidenceStrength: trust,
      reason: "The same evidence is linked to another requirement and needs a sufficiency review.",
      assessedAt: iso(now),
    });
    return;
  }

  const claim = writeClaim(state, resolution, requirement, command, evidence, now, trust);
  const permission = writePermission(state, claim, command, now);

  if (requirement.requiredTrustLevel !== "DECLARED" && (!evidence || trust === "DECLARED")) {
    resolution.state = "EVIDENCE_REQUIRED";
    fail(state, resolution, "EVIDENCE_MISSING", now, {
      nextAction:
        command.evidenceRoute === "SUPPLIER_ATTESTATION"
          ? "Attestation received, but documentary evidence is still required."
          : "Ask for a document. Declared is not enough for this dataset.",
    });
    claim.ready = false;
    recordAssessment(state, {
      caseId: command.caseId,
      requirementId: requirement.id,
      evidenceId: evidence?.id,
      claimId: claim.id,
      result: "INSUFFICIENT",
      evidenceStrength: trust,
      reason:
        command.evidenceRoute === "SUPPLIER_ATTESTATION"
          ? "Attestation received, but documentary evidence is still required."
          : "A value was declared without sufficient evidence.",
      assessedAt: iso(now),
    });
    return;
  }

  const report = evaluateReadiness({
    identity: {
      matched: resolution.identityStatus === "IDENTITY_MATCHED",
      confidence: resolution.identityConfidence ?? 99,
      autoLinkThreshold: state.tenant.identityAutoLinkThreshold,
    },
    valuePresent: Boolean(claim.value),
    trustLevel: claim.trustLevel,
    requiredTrustLevel: requirement.requiredTrustLevel,
    evidence,
    evidenceRequired: requirement.requiredTrustLevel !== "DECLARED",
    scopeMatch,
    permission: permission.state,
    permissionDecision: evaluatePermission({
      storedState: permission.state,
      visibility: permission.visibility,
      permissionRequired: requirement.requiredPermissionLevel === "granted",
      requestingOrganisationId: state.tenant.id,
      granteeActorId: permission.granteeActorId,
      purpose: requirement.purpose,
      grantPurpose: permission.purpose,
      now,
      validFrom: permission.validFrom,
      validUntil: permission.validUntil,
      revokedAt: permission.revokedAt,
    }),
    permissionRequired: requirement.requiredPermissionLevel === "granted",
    conflict: false,
    permissionContext: {
      visibility: permission.visibility,
      requestingOrganisationId: state.tenant.id,
      granteeActorId: permission.granteeActorId,
      purpose: requirement.purpose,
      grantPurpose: permission.purpose,
      now,
    },
  });

  if (!report.ready) {
    if (report.blockingReason === "AUTHORIZATION_REQUIRED" || command.permission === "REQUEST_REQUIRED") {
      resolution.state = "AUTHORIZATION_REQUIRED";
      fail(state, resolution, "AUTHORIZATION_REQUIRED", now);
    } else if (report.blockingReason === "PERMISSION_DENIED") {
      resolution.state = "PERMISSION_CHECK";
      fail(state, resolution, "PERMISSION_DENIED", now);
    } else {
      fail(state, resolution, report.blockingReason ?? "UNRESOLVABLE", now, { state: "VALIDATING" });
    }
    claim.ready = false;
    const assessed = assessRequirementSufficiency({
      caseState: resolution.state,
      claimReady: false,
      trustLevel: claim.trustLevel,
      requiredTrustLevel: requirement.requiredTrustLevel,
      conflict: false,
      reviewRequired:
        report.blockingReason !== "AUTHORIZATION_REQUIRED" &&
        report.blockingReason !== "PERMISSION_DENIED" &&
        command.permission !== "REQUEST_REQUIRED",
      route: command.evidenceRoute,
    });
    recordAssessment(state, {
      caseId: command.caseId,
      requirementId: requirement.id,
      evidenceId: evidence?.id,
      claimId: claim.id,
      result: assessed.result,
      evidenceStrength: claim.trustLevel,
      reason: assessed.reason,
      assessedAt: iso(now),
    });
    return;
  }

  markReady(state, resolution, claim, now, emit, "Supplier provided value, evidence and permission.", "SUPPLIER_RESPONSE");
  const assessed = assessRequirementSufficiency({
    caseState: resolution.state,
    claimReady: true,
    trustLevel: claim.trustLevel,
    requiredTrustLevel: requirement.requiredTrustLevel,
    conflict: false,
    reviewRequired: false,
    route: command.evidenceRoute,
  });
  recordAssessment(state, {
    caseId: command.caseId,
    requirementId: requirement.id,
    evidenceId: evidence?.id,
    claimId: claim.id,
    result: assessed.result,
    evidenceStrength: claim.trustLevel,
    reason: assessed.reason,
    assessedAt: iso(now),
  });
}

function upsertReuseConsent(
  state: EngineState,
  resolution: ResolutionCase,
  evidence: EvidenceRecord,
  sourceClaim: ClaimRecord,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
): EvidenceReuseConsent {
  const requirement = requirementOf(state, resolution);
  const key = reuseConsentKey({
    evidenceId: evidence.id,
    caseId: resolution.id,
    requirementId: requirement.id,
    organisationId: state.tenant.id,
    purpose: requirement.purpose,
  });
  const existing = state.reuseConsents.find((row) => row.key === key);
  if (existing) {
    if (evidence.supersededByEvidenceId && existing.status === "PENDING") {
      existing.status = "SUPERSEDED";
      emit({
        type: "reuse.candidate_superseded",
        caseId: resolution.id,
        actor: "SOURCE_SYSTEM",
        timestamp: iso(now),
        detail: "The proposed evidence was superseded. This reuse request is no longer current.",
        payload: { consentId: existing.id, evidenceId: evidence.id },
      });
    }
    return existing;
  }
  const originalRequirement = sourceClaim.requirementId
    ? state.requirements.find((item) => item.id === sourceClaim.requirementId)
    : undefined;
  const consent: EvidenceReuseConsent = {
    id: id(state, "ruc"),
    key,
    evidenceId: evidence.id,
    caseId: resolution.id,
    requirementId: requirement.id,
    productIds: requirement.productIds,
    originalCaseId: sourceClaim.caseId,
    originalRequirementId: sourceClaim.requirementId,
    originalProductIds: originalRequirement?.productIds ?? (sourceClaim.productId ? [sourceClaim.productId] : []),
    originalScopeLabel: originalRequirement
      ? `${originalRequirement.subjectLabel} — ${originalRequirement.propertyLabel}`
      : sourceClaim.productId,
    proposedScopeLabel: `${requirement.subjectLabel} — ${requirement.propertyLabel}`,
    requestingOrganisationId: state.tenant.id,
    supplierId: evidence.ownerActorId,
    purpose: requirement.purpose,
    evidenceReusePolicy: evidence.reusePolicy ?? "ASK_FOR_REUSE",
    disclosureMode: inheritedDisclosureMode(evidence),
    disclosureAcceptanceId: evidence.disclosureAcceptanceId,
    agreementVersion: evidence.agreementVersion,
    status: "PENDING",
    createdAt: iso(now),
  };
  state.reuseConsents.push(consent);
  emit({
    type: "reuse.candidate_created",
    caseId: resolution.id,
    actor: "SOURCE_SYSTEM",
    timestamp: iso(now),
    detail: "SOURCE recognised existing evidence as a reuse candidate. It has not been applied.",
    payload: {
      consentId: consent.id,
      evidenceId: evidence.id,
      evidenceReusePolicy: consent.evidenceReusePolicy,
      purpose: consent.purpose,
    },
  });
  return consent;
}

function decideEvidenceReuse(
  state: EngineState,
  command: Extract<Command, { type: "DECIDE_EVIDENCE_REUSE" }>,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const resolution = caseById(state, command.caseId);
  const consent =
    findReuseConsent(state, {
      consentId: command.consentId,
      caseId: command.caseId,
      evidenceId: command.evidenceId,
    }) ?? state.reuseConsents.find((row) => row.caseId === command.caseId && row.status === "PENDING");
  if (!consent) {
    throw new EngineValidationError("REUSE_CONSENT_NOT_FOUND", "There is no reuse request to decide for this case.");
  }
  if (consent.caseId !== command.caseId) {
    throw new EngineValidationError("SCOPE_FORGERY", "That reuse request does not belong to this requirement.");
  }
  if (consent.supplierId !== resolution.currentActorId && consent.supplierId !== (resolution.supplierId ?? "")) {
    throw new EngineValidationError("REUSE_CONSENT_FORBIDDEN", "Only the supplier who provided this evidence can decide reuse.");
  }
  if (command.decidedBy && command.decidedBy !== consent.supplierId) {
    throw new EngineValidationError("REUSE_CONSENT_FORBIDDEN", "Only the supplier who provided this evidence can decide reuse.");
  }
  if (consent.requestingOrganisationId !== state.tenant.id) {
    throw new EngineValidationError("SCOPE_FORGERY", "This reuse request does not belong to this organisation.");
  }
  if (consent.status === "DECLINED" && command.decision === "APPROVED") {
    throw new EngineValidationError("REUSE_CONSENT_IMMUTABLE", "That reuse request was already declined.");
  }
  if (consent.status === "APPROVED" && command.decision === "DECLINED") {
    throw new EngineValidationError("REUSE_CONSENT_IMMUTABLE", "That reuse request was already approved.");
  }
  const evidence = state.evidence.find((item) => item.id === consent.evidenceId);
  const originalClaim =
    (consent.originalCaseId
      ? state.claims.find((item) => item.caseId === consent.originalCaseId && item.evidenceId === consent.evidenceId)
      : undefined) ?? state.claims.find((item) => item.evidenceId === consent.evidenceId);
  if (!evidence || !originalClaim) {
    throw new EngineValidationError("REUSE_CONSENT_NOT_FOUND", "The proposed evidence is no longer available.");
  }

  if (consent.status === "APPROVED" && command.decision === "APPROVED") {
    applyExistingEvidenceToCase(state, resolution, evidence, originalClaim, now, emit, "SAME_TENANT_REUSE");
    return;
  }

  consent.status = command.decision === "APPROVED" ? "APPROVED" : "DECLINED";
  consent.decision = command.decision;
  consent.decidedAt = iso(now);
  consent.decidedBy = command.decidedBy ?? command.portalGrantId ?? resolution.currentActorId ?? "supplier";
  consent.grantId = command.portalGrantId;
  for (const task of state.tasks) {
    if (task.caseId === command.caseId && task.kind === "reuse" && task.status === "open") task.status = "done";
  }
  emit({
    type: command.decision === "APPROVED" ? "reuse.consent_approved" : "reuse.consent_declined",
    caseId: command.caseId,
    actor: consent.decidedBy,
    timestamp: iso(now),
    detail:
      command.decision === "APPROVED"
        ? "Supplier authorised reuse for this request only. SOURCE will now assess sufficiency."
        : "Supplier declined reuse. The requirement stays open for new evidence.",
    payload: {
      consentId: consent.id,
      evidenceId: evidence.id,
      decision: command.decision,
      evidenceReusePolicy: consent.evidenceReusePolicy,
      agreementVersion: consent.agreementVersion ?? "",
    },
  });

  if (command.decision === "DECLINED") {
    resolution.state = "WAITING_RESPONSE";
    resolution.blockingReason = undefined;
    resolution.nextAction = "Provide new evidence, alternative evidence, an authorised declaration, or say you cannot provide it.";
    resolution.version += 1;
    return;
  }

  applyExistingEvidenceToCase(state, resolution, evidence, originalClaim, now, emit, "SAME_TENANT_REUSE");
}

function applyExistingEvidenceToCase(
  state: EngineState,
  resolution: ResolutionCase,
  evidence: EvidenceRecord,
  sourceClaim: ClaimRecord,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void,
  mechanism: ResolutionMechanism
) {
  if (state.claims.some((claim) => claim.caseId === resolution.id && claim.evidenceId === evidence.id)) {
    return;
  }
  const requirement = requirementOf(state, resolution);
  const disclosureMode = inheritedDisclosureMode(evidence);
  const sourcePermission = state.permissions.find((item) => item.claimId === sourceClaim.id);
  applySubmittedEvidenceToCase(
    state,
    {
      type: "SUBMIT_RESPONSE",
      caseId: resolution.id,
      value: sourceClaim.value,
      unit: sourceClaim.unit,
      permission: sourcePermission?.state === "GRANTED" ? "GRANTED" : sourceClaim.permissionState,
      visibility: sourcePermission?.visibility,
      evidenceRoute: evidence.route,
      disclosureMode,
      reusePolicy: evidence.reusePolicy,
      issuerClass: evidence.issuerClass,
    },
    evidence,
    now,
    emit,
    Boolean(evidence.route)
  );
  const newClaim = state.claims.find((claim) => claim.caseId === resolution.id && claim.evidenceId === evidence.id);
  if (newClaim) {
    newClaim.trustLevel = sourceClaim.trustLevel;
    const newPermission = state.permissions.find((item) => item.claimId === newClaim.id);
    if (newPermission && sourcePermission) newPermission.visibility = sourcePermission.visibility;
    refreshReadinessCache(state, resolution.id);
    if (resolution.state === "READY" && !newClaim.ready) {
      resolution.state = "EVIDENCE_REQUIRED";
      resolution.resolutionOutcome = undefined;
      resolution.closedAt = undefined;
    }
    const outcome = [...state.requirementOutcomes].reverse().find((row) => row.requirementId === requirement.id);
    if (outcome) outcome.mechanism = mechanism;
  }
}

function recordAssessment(
  state: EngineState,
  row: Omit<RequirementEvidenceAssessment, "id" | "assessedBy">
) {
  state.requirementAssessments.push({
    ...row,
    id: id(state, "ras"),
    assessedBy: "SOURCE_SYSTEM",
  });
}

function writeClaim(
  state: EngineState,
  resolution: ResolutionCase,
  requirement: ReturnType<typeof requirementOf>,
  command: Extract<Command, { type: "SUBMIT_RESPONSE" }>,
  evidence: EvidenceRecord | undefined,
  now: Date,
  trust: ClaimRecord["trustLevel"]
): ClaimRecord {
  const claim: ClaimRecord = {
    id: id(state, "cl"),
    requirementId: requirement.id,
    caseId: resolution.id,
    propertyId: requirement.propertyId,
    value: command.value,
    unit: command.unit,
    subjectId: requirement.subjectId,
    productId: requirement.productIds[0] ?? resolution.productId ?? "",
    declaredByActorId: resolution.currentActorId ?? "",
    evidenceId: evidence?.id,
    validUntil: evidence?.validUntil,
    trustLevel: trust,
    permissionState: command.permission,
    purpose: requirement.purpose,
    identityConfidence: resolution.identityConfidence ?? 99,
    ready: false,
    extractionProvenance: evidence?.extractedValue ? "ai_extracted" : "declared_by_supplier",
    downstreamTargets: [],
  };
  state.claims.push(claim);
  if (evidence) evidence.linkedClaimIds.push(claim.id);
  return claim;
}

function writePermission(
  state: EngineState,
  claim: ClaimRecord,
  command: Extract<Command, { type: "SUBMIT_RESPONSE" }>,
  now: Date
): PermissionGrant {
  const grant: PermissionGrant = {
    id: id(state, "perm"),
    claimId: claim.id,
    evidenceId: claim.evidenceId,
    granteeActorId: state.tenant.id,
    purpose: claim.purpose,
    state: command.permission,
    visibility: command.disclosureMode
      ? mapDisclosureModeToPermissionVisibility(command.disclosureMode)
      : (command.visibility ?? "value"),
    createdAt: now.toISOString(),
  };
  state.permissions.push(grant);
  return grant;
}

function markReady(
  state: EngineState,
  resolution: ResolutionCase,
  claim: ClaimRecord,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void,
  detail: string,
  mechanism: ResolutionMechanism = "EXISTING_CLAIM"
) {
  claim.ready = true;
  const requirement = requirementOf(state, resolution);
  requirement.resolvedAt = iso(now);
  recordRequirementOutcome(state, {
    requirementId: requirement.id,
    mechanism,
    claimId: claim.id,
    evidenceId: claim.evidenceId,
    recordedAt: iso(now),
  });
  resolution.state = "READY";
  resolution.resolutionOutcome = "READY";
  resolution.closedAt = iso(now);
  resolution.blockingReason = undefined;
  resolution.nextAction = "Offer downstream sync according to output policy.";
  resolution.downstreamSyncOffered = true;
  resolution.downstreamSyncBlocked = false;
  resolution.downstreamUsages = resolution.downstreamUsages?.length ? resolution.downstreamUsages : ["DPP"];
  if (!state.dependencies.some((d) => d.claimId === claim.id)) {
    state.dependencies.push({
      id: id(state, "dep"),
      claimId: claim.id,
      target: "DPP",
      status: "active",
    });
  }
  resolution.version += 1;
  emit({
    type: "case.ready",
    caseId: resolution.id,
    actor: "SOURCE_SYSTEM",
    timestamp: iso(now),
    detail,
  });
}

function setPermission(
  state: EngineState,
  caseId: string,
  nextState: PermissionGrant["state"],
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const resolution = caseById(state, caseId);
  const claim = state.claims.find((c) => c.caseId === caseId);
  if (!claim) return;
  claim.permissionState = nextState;
  const grant = state.permissions.find((p) => p.claimId === claim.id);
  if (grant) grant.state = nextState;
  emit({
    type: nextState === "GRANTED" ? "permission.granted" : "permission.denied",
    caseId,
    actor: resolution.currentActorId ?? "supplier",
    timestamp: iso(now),
    detail: `Permission ${nextState.toLowerCase()}.`,
  });
  if (nextState === "GRANTED") {
    const requirement = requirementOf(state, resolution);
    const evidence = claim.evidenceId ? state.evidence.find((e) => e.id === claim.evidenceId) : undefined;
    const report = evaluateReadiness({
      identity: {
        matched: true,
        confidence: claim.identityConfidence,
        autoLinkThreshold: state.tenant.identityAutoLinkThreshold,
      },
      valuePresent: Boolean(claim.value),
      trustLevel: claim.trustLevel,
      requiredTrustLevel: requirement.requiredTrustLevel,
      evidence,
      evidenceRequired: requirement.requiredTrustLevel !== "DECLARED",
      scopeMatch: true,
      permission: "GRANTED",
      permissionDecision: "ALLOW",
      permissionRequired: true,
      conflict: state.conflicts.some((c) => c.caseId === caseId && !c.resolved),
    });
    if (report.ready) markReady(state, resolution, claim, now, emit, "Authorization granted. Claim is reusable.", "AUTHORIZATION");
  } else {
    claim.ready = false;
    resolution.state = "PERMISSION_CHECK";
    fail(state, resolution, "PERMISSION_DENIED", now);
  }
}

function revokePermission(
  state: EngineState,
  claimId: string,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const claim = state.claims.find((c) => c.id === claimId);
  if (!claim) return;
  claim.permissionState = "REVOKED";
  claim.ready = false;
  const grant = state.permissions.find((p) => p.claimId === claimId);
  if (grant) {
    grant.state = "REVOKED";
    grant.revokedAt = iso(now);
  }
  for (const dep of state.dependencies.filter((d) => d.claimId === claimId)) {
    dep.status = "flagged";
  }
  const resolution = state.cases.find((c) => c.id === claim.caseId);
  if (resolution) {
    resolution.state = "PERMISSION_CHECK";
    resolution.downstreamSyncBlocked = true;
    fail(state, resolution, "PERMISSION_REVOKED", now, {
      nextAction: "Notify affected organisations. Historical audit remains intact.",
    });
  }
  emit({
    type: "permission.revoked",
    caseId: claim.caseId,
    actor: claim.declaredByActorId,
    timestamp: iso(now),
    detail: "Permission revoked. Future reuse blocked. History kept.",
  });
}

function expireEvidence(
  state: EngineState,
  evidenceId: string,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const evidence = state.evidence.find((e) => e.id === evidenceId);
  if (!evidence) return;
  evidence.expired = true;
  emit({
    type: "evidence.expired",
    actor: "SOURCE_SYSTEM",
    timestamp: iso(now),
    detail: `${evidence.filename} expired. Claims are kept and reevaluated.`,
  });
  for (const claim of state.claims.filter((c) => c.evidenceId === evidenceId)) {
    claim.ready = false;
    claim.trustLevel = "DECLARED";
    const resolution =
      state.cases.find((c) => c.id === claim.caseId) ??
      state.cases.find((c) => c.requirementId === claim.requirementId);
    if (!resolution) continue;
    const requirement = requirementOf(state, resolution);
    if (requirement.requiredTrustLevel !== "DECLARED") {
      resolution.state = "RENEWAL_REQUIRED";
      fail(state, resolution, "EVIDENCE_EXPIRED", now, {
        nextAction: "Start renewal workflow.",
        resolutionOutcome: undefined,
        closedAt: undefined,
      });
    }
    emit({
      type: "evidence.expiring",
      caseId: resolution.id,
      actor: "SOURCE_SYSTEM",
      timestamp: iso(now),
      detail: "Renewal case opened according to policy.",
    });
    refreshReadinessCache(state, resolution.id);
  }
}

function resolveConflict(
  state: EngineState,
  caseId: string,
  outcome: Extract<Command, { type: "RESOLVE_CONFLICT" }>["outcome"],
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const resolution = caseById(state, caseId);
  const conflict = state.conflicts.find((c) => c.caseId === caseId && !c.resolved);
  if (conflict) {
    conflict.resolved = true;
    conflict.outcome = outcome;
  }
  const claim = state.claims.find((c) => c.caseId === caseId);
  emit({
    type: "claim.conflict_resolved",
    caseId,
    actor: "reviewer",
    timestamp: iso(now),
    detail: `Conflict resolved: ${outcome}.`,
  });
  if (claim && (outcome === "latest_supersedes" || outcome === "supplier_correction" || outcome === "manual_adjudication")) {
    const grant = state.permissions.find((p) => p.claimId === claim.id);
    if (grant) grant.state = "GRANTED";
    claim.permissionState = "GRANTED";
    claim.trustLevel = "EVIDENCED";
    markReady(state, resolution, claim, now, emit, "Conflict adjudicated. Claim may return downstream.", "HUMAN_ENTRY");
  }
}

function confirmIdentity(
  state: EngineState,
  command: Extract<Command, { type: "CONFIRM_IDENTITY" }>,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const resolution = caseById(state, command.caseId);
  resolution.identityStatus =
    command.decision === "confirm" || command.decision === "merge" ? "IDENTITY_MATCHED" : "IDENTITY_NOT_FOUND";
  if (command.actorId) resolution.currentActorId = command.actorId;
  resolution.identityConfidence = command.decision === "confirm" ? 99.9 : resolution.identityConfidence;
  state.identityDecisions.push({
    id: id(state, "idec"),
    tenantId: state.tenant.id,
    subject: "actor",
    query: resolution.id,
    decision: command.decision,
    fromIds: resolution.currentActorId ? [resolution.currentActorId] : [],
    toId: command.actorId,
    decidedBy: "reviewer",
    modelVersion: IDENTITY_ENGINE_VERSION,
    createdAt: iso(now),
  });
  emit({
    type: "identity.resolved",
    caseId: command.caseId,
    actor: "reviewer",
    timestamp: iso(now),
    detail: `Human decision ${command.decision} stored as provenance.`,
  });
  if (resolution.identityStatus === "IDENTITY_MATCHED") {
    resolution.state = "ROUTING";
    sendRequest(state, command.caseId, now, emit);
  }
}

function closeUnresolved(
  state: EngineState,
  caseId: string,
  explanation: string,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const resolution = caseById(state, caseId);
  resolution.state = "UNRESOLVED";
  resolution.resolutionOutcome = "UNRESOLVED";
  resolution.closedAt = iso(now);
  fail(state, resolution, "UNRESOLVABLE", now, {
    blockingExplanation: explanation,
    nextAction: "Remaining options: new actor, public evidence, or accept a gap in the dataset.",
  });
  emit({
    type: "case.unresolved",
    caseId,
    actor: "SOURCE_SYSTEM",
    timestamp: iso(now),
    detail: explanation,
  });
}

function assignColleague(
  state: EngineState,
  caseId: string,
  contact: Omit<ContactPoint, "id" | "valid">,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const created: ContactPoint = { ...contact, id: id(state, "ct"), valid: true };
  state.contacts.push(created);
  changeContact(state, caseId, created.id, now, emit);
}

function inferRelationKind(parentKind?: string, childKind?: string): SubjectRelationKind {
  if (parentKind === "PRODUCT" && childKind === "PACKAGING") return "uses";
  if ((parentKind === "MATERIAL" || parentKind === "COMPONENT") && childKind === "RAW_MATERIAL") return "derived_from";
  if ((parentKind === "PRODUCT" || parentKind === "COMPONENT") && (childKind === "MATERIAL" || childKind === "RAW_MATERIAL")) {
    return "made_of";
  }
  return "contains";
}

function addSubject(
  state: EngineState,
  command: Extract<Command, { type: "ADD_SUBJECT" }>,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const source = command.source ?? "USER_ADDED";
  const mapping = command.externalId
    ? state.tenantSubjectMappings.find(
        (m) => m.sourceRecordId === command.externalId && m.tenantId === state.tenant.id && m.decision !== "rejected"
      )
    : undefined;
  const subjectId = mapping?.canonicalSubjectId ?? id(state, "sub");
  if (!mapping) {
    state.subjects.push({
      id: subjectId,
      kind: command.kind,
      name: command.name,
      createdBy: command.createdBy ?? "user",
      createdAt: iso(now),
      source,
      confidence: source === "USER_ADDED" ? 100 : source === "AI_EXTRACTED" ? 70 : 90,
      sourceReference: command.sourceReference ?? (source === "USER_ADDED" ? "manual_entry" : undefined),
      declaredSupplierId: command.supplierId,
    });
    if (command.externalId) {
      state.tenantSubjectMappings.push({
        id: id(state, "map"),
        tenantId: state.tenant.id,
        sourceSystem: "import",
        sourceRecordId: command.externalId,
        canonicalSubjectId: subjectId,
        matchMethod: "deterministic",
        confidence: 100,
        decision: "created",
        modelVersion: IDENTITY_ENGINE_VERSION,
        createdAt: iso(now),
      });
    }
  }
  const subject = state.subjects.find((s) => s.id === subjectId);
  if (subject && command.supplierId && !subject.declaredSupplierId) {
    subject.declaredSupplierId = command.supplierId;
  }
  for (const ident of command.identifiers ?? []) {
    if (!state.subjectIdentifiers.some((row) => row.canonicalSubjectId === subjectId && row.scheme === ident.scheme && row.value === ident.value)) {
      state.subjectIdentifiers.push({
        id: id(state, "sid"),
        canonicalSubjectId: subjectId,
        scheme: ident.scheme,
        value: ident.value,
      });
    }
  }
  if (command.parentSubjectId) {
    const parent = state.subjects.find((s) => s.id === command.parentSubjectId);
    const child = state.subjects.find((s) => s.id === subjectId);
    const already = state.subjectRelationships.some(
      (r) => r.parentSubjectId === command.parentSubjectId && r.childSubjectId === subjectId
    );
    if (!already) {
      state.subjectRelationships.push({
        id: id(state, "srel"),
        parentSubjectId: command.parentSubjectId,
        childSubjectId: subjectId,
        kind: command.relationshipKind ?? inferRelationKind(parent?.kind, child?.kind),
        quantity: command.quantity,
        unit: command.unit,
        supplierActorId: command.supplierId,
        source,
        createdBy: command.createdBy ?? "user",
        createdAt: iso(now),
      });
    } else if (command.supplierId) {
      const existingRel = state.subjectRelationships.find(
        (r) => r.parentSubjectId === command.parentSubjectId && r.childSubjectId === subjectId
      );
      if (existingRel && !existingRel.supplierActorId) existingRel.supplierActorId = command.supplierId;
    }
  }
  emit({
    type: "subject.added",
    actor: command.createdBy ?? "user",
    timestamp: iso(now),
    detail: mapping ? `Mapped ${command.kind.toLowerCase()} ${command.name} to existing subject.` : `Added ${command.kind.toLowerCase()} ${command.name} (${source}).`,
    payload: { source, kind: command.kind },
  });

  if (command.generateRequirements === false) return;

  const productIds =
    command.productIds ??
    (command.parentSubjectId
      ? productIdsForSubject(command.parentSubjectId, state.subjects, state.subjectRelationships)
      : []);
  for (const property of defaultPropertiesForKind(command.kind)) {
    const requirement = {
      id: id(state, "ireq"),
      tenantId: state.tenant.id,
      subjectId,
      subjectLabel: command.name,
      productIds: productIds.length ? productIds : command.parentSubjectId ? [command.parentSubjectId] : [subjectId],
      propertyId: property.propertyId,
      propertyLabel: property.propertyLabel,
      datasetId: "espr-al-2027",
      purpose: "DPP_COMPLIANCE" as const,
      requiredTrustLevel: "EVIDENCED" as const,
      requiredPermissionLevel: "granted" as const,
      requiredBy: addDays(now, 180),
      priority: 50,
      createdAt: iso(now),
    };
    openRequirement(
      state,
      {
        type: "OPEN_REQUIREMENT",
        requirement,
        declaredSupplierId: command.supplierId,
        planOnly: command.planOnly,
      },
      now,
      emit
    );
  }
}

function mergeSubjects(
  state: EngineState,
  command: Extract<Command, { type: "MERGE_SUBJECTS" }>,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const from = state.subjects.find((s) => s.id === command.fromSubjectId);
  const to = state.subjects.find((s) => s.id === command.toSubjectId);
  if (!from || !to || from.id === to.id) return;
  for (const rel of state.subjectRelationships) {
    if (rel.parentSubjectId === from.id) rel.parentSubjectId = to.id;
    if (rel.childSubjectId === from.id) rel.childSubjectId = to.id;
  }
  for (const ident of state.subjectIdentifiers) {
    if (ident.canonicalSubjectId === from.id) ident.canonicalSubjectId = to.id;
  }
  for (const mapping of state.tenantSubjectMappings) {
    if (mapping.canonicalSubjectId === from.id) mapping.canonicalSubjectId = to.id;
  }
  for (const requirement of state.requirements) {
    if (requirement.subjectId === from.id) {
      requirement.subjectId = to.id;
      requirement.subjectLabel = to.name;
      requirement.productIds = productIdsForSubject(to.id, state.subjects, state.subjectRelationships);
    }
  }
  for (const claim of state.claims) {
    if (claim.subjectId === from.id) claim.subjectId = to.id;
  }
  state.subjects = state.subjects.filter((s) => s.id !== from.id);
  state.identityDecisions.push({
    id: id(state, "idec"),
    tenantId: state.tenant.id,
    subject: "canonical_subject",
    query: from.name,
    decision: "merge",
    fromIds: [from.id],
    toId: to.id,
    decidedBy: command.createdBy ?? "reviewer",
    modelVersion: IDENTITY_ENGINE_VERSION,
    createdAt: iso(now),
  });
  emit({
    type: "identity.resolved",
    actor: command.createdBy ?? "reviewer",
    timestamp: iso(now),
    detail: `Merged ${from.name} into ${to.name}. Confirming this unlocks requirements on the canonical subject.`,
    payload: { from: from.id, to: to.id },
  });
}

function splitSubject(
  state: EngineState,
  command: Extract<Command, { type: "SPLIT_SUBJECT" }>,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const original = state.subjects.find((s) => s.id === command.subjectId);
  if (!original) return;
  const created = {
    id: id(state, "sub"),
    kind: original.kind,
    name: command.newName,
    createdBy: command.createdBy ?? "user",
    createdAt: iso(now),
    source: "USER_ADDED" as const,
    confidence: 100,
    sourceReference: "split",
  };
  state.subjects.push(created);
  for (const rel of state.subjectRelationships) {
    if (command.moveRelationshipIds?.includes(rel.id)) {
      if (rel.parentSubjectId === original.id) rel.parentSubjectId = created.id;
      if (rel.childSubjectId === original.id) rel.childSubjectId = created.id;
    }
  }
  state.identityDecisions.push({
    id: id(state, "idec"),
    tenantId: state.tenant.id,
    subject: "canonical_subject",
    query: original.name,
    decision: "split",
    fromIds: [original.id],
    toId: created.id,
    decidedBy: command.createdBy ?? "reviewer",
    modelVersion: IDENTITY_ENGINE_VERSION,
    createdAt: iso(now),
  });
  emit({
    type: "identity.resolved",
    actor: command.createdBy ?? "reviewer",
    timestamp: iso(now),
    detail: `Split ${original.name} → ${created.name}.`,
  });
}

function bulkCorrectSubjects(
  state: EngineState,
  command: Extract<Command, { type: "APPLY_BULK_SUBJECT_CORRECTION" }>,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  let count = 0;
  for (const rel of state.subjectRelationships) {
    if (rel.childSubjectId !== command.matchChildSubjectId) continue;
    rel.childSubjectId = command.replaceChildSubjectId;
    rel.source = "USER_ADDED";
    count += 1;
  }
  emit({
    type: "subject.relationship_corrected",
    actor: command.createdBy ?? "user",
    timestamp: iso(now),
    detail: `Applied correction to ${count} matching occurrences.`,
    payload: { count },
  });
}

function correctSubjectRelationship(
  state: EngineState,
  command: Extract<Command, { type: "CORRECT_SUBJECT_RELATIONSHIP" }>,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const rel = state.subjectRelationships.find((r) => r.id === command.relationshipId);
  if (!rel) return;
  if (command.childSubjectId) rel.childSubjectId = command.childSubjectId;
  if (command.quantity !== undefined) rel.quantity = command.quantity;
  if (command.unit !== undefined) rel.unit = command.unit;
  rel.source = "USER_ADDED";
  rel.createdBy = command.createdBy ?? "user";
  emit({
    type: "subject.relationship_corrected",
    actor: command.createdBy ?? "user",
    timestamp: iso(now),
    detail: `Corrected relationship ${rel.id}. Provenance is USER_ADDED.`,
  });
}

export function caseReadiness(state: EngineState, caseId: string) {
  const resolution = caseById(state, caseId);
  const requirement = requirementOf(state, resolution);
  const claim = state.claims.find((c) => c.caseId === caseId);
  const evidence = claim?.evidenceId ? state.evidence.find((e) => e.id === claim.evidenceId) : undefined;
  const permission = claim ? state.permissions.find((p) => p.claimId === claim.id) : undefined;
  const conflict = state.conflicts.some((c) => c.caseId === caseId && !c.resolved);
  return evaluateReadiness({
    identity: {
      matched: resolution.identityStatus === "IDENTITY_MATCHED",
      confidence: resolution.identityConfidence ?? 0,
      autoLinkThreshold: state.tenant.identityAutoLinkThreshold,
      ambiguous: resolution.identityStatus === "IDENTITY_AMBIGUOUS",
    },
    valuePresent: Boolean(claim?.value),
    trustLevel: claim?.trustLevel,
    requiredTrustLevel: requirement.requiredTrustLevel,
    evidence,
    evidenceRequired: requirement.requiredTrustLevel !== "DECLARED",
    scopeMatch: evidenceScopeApplies(evidence, requirement.subjectId),
    permission: permission?.state ?? claim?.permissionState ?? "UNKNOWN",
    permissionDecision: evaluatePermission({
      storedState: permission?.state ?? claim?.permissionState ?? "UNKNOWN",
      visibility: permission?.visibility,
      permissionRequired: requirement.requiredPermissionLevel === "granted",
      requestingOrganisationId: state.tenant.id,
      granteeActorId: permission?.granteeActorId,
      purpose: requirement.purpose,
      grantPurpose: permission?.purpose,
      now: new Date(0),
      validFrom: permission?.validFrom,
      validUntil: permission?.validUntil,
      revokedAt: permission?.revokedAt,
    }),
    permissionRequired: requirement.requiredPermissionLevel === "granted",
    conflict,
    permissionContext: {
      visibility: permission?.visibility,
      requestingOrganisationId: state.tenant.id,
      granteeActorId: permission?.granteeActorId,
      purpose: requirement.purpose,
      grantPurpose: permission?.purpose,
      now: new Date(0),
    },
  });
}

export { mayAutoLinkEvidence };
