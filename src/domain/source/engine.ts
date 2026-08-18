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
import type {
  AuditEvent,
  ClaimRecord,
  Command,
  ContactPoint,
  EngineResult,
  EngineState,
  EvidenceRecord,
  ExceptionCode,
  PermissionGrant,
  ResolutionAttempt,
  ResolutionCase,
  ResolutionMechanism,
  SubjectRelationKind,
  SupplierRequest,
} from "./types";

export function hydrateEngineState(state: EngineState): EngineState {
  state.requirementOutcomes ??= [];
  state.contactAvoidances ??= [];
  state.pilotRuns ??= [];
  state.requestGroups ??= [];
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
    case "SUBMIT_RESPONSE":
      submitResponse(next, command, now, emit);
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

  if (plan.candidateClaimId) {
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
  if (plan.strategy === "alternative_contact" || !resolution.currentActorId) {
    resolution.state = "REVIEW_ROUTING";
    resolution.nextAction = plan.reason || "Review routing. Confidence is too low to send.";
    return done(state, state.events.filter((e) => e.caseId === resolution.id), resolution.id);
  }

  if (plan.strategy === "human_review" || plan.strategy === "explained_unresolved") {
    resolution.state = "REVIEW_ROUTING";
    resolution.nextAction = plan.reason;
    return done(state, state.events.filter((e) => e.caseId === resolution.id), resolution.id);
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
  fail(state, resolution, "NO_RESPONSE", now, {
    nextAction: "Automatic reminder",
    nextActionAt: addDays(now, 3),
    ownerLabel: resolution.ownerLabel ?? "Procurement",
  });
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

function submitResponse(
  state: EngineState,
  command: Extract<Command, { type: "SUBMIT_RESPONSE" }>,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void
) {
  const resolution = caseById(state, command.caseId);
  const requirement = requirementOf(state, resolution);
  const request = state.requests.find((r) => r.id === resolution.requestId);
  if (request) {
    request.status = "SUBMITTED";
    request.lastActivityAt = iso(now);
  }
  resolution.state = "RESPONSE_RECEIVED";

  let evidence: EvidenceRecord | undefined;
  if (command.evidence) {
    const existing = command.evidence.storageObjectId
      ? state.evidence.find((item) => item.storageObjectId === command.evidence?.storageObjectId)
      : undefined;
    evidence = existing ?? {
      id: id(state, "ev"),
      filename: command.evidence.filename,
      sha256: command.evidence.sha256 ?? `sha-${state.seq}`,
      issuer: state.actors.find((a) => a.id === resolution.currentActorId)?.name ?? "Supplier",
      ownerActorId: resolution.currentActorId ?? "unknown",
      validUntil: addDays(now, 400),
      expired: false,
      scope: command.evidence.scope ?? { kind: "product", id: requirement.subjectId, label: requirement.subjectLabel },
      visibility: command.visibility === "verification_only" ? "protected" : "private",
      linkedClaimIds: [],
      extractedValue: command.evidence.extractedValue,
      extractionConfidence: command.evidence.confidence,
      storageObjectId: command.evidence.storageObjectId,
      mimeType: command.evidence.mimeType,
      sizeBytes: command.evidence.sizeBytes,
      availability: command.evidence.availability ?? (command.evidence.storageObjectId ? "AVAILABLE" : undefined),
      supersedesEvidenceId: command.evidence.supersedesEvidenceId,
    };
    if (existing) {
      if (command.evidence.scope) existing.scope = command.evidence.scope;
      if (command.evidence.extractedValue) existing.extractedValue = command.evidence.extractedValue;
      if (command.evidence.confidence !== undefined) existing.extractionConfidence = command.evidence.confidence;
    }
    if (!existing) {
      if (command.evidence.supersedesEvidenceId) {
        const previous = state.evidence.find((item) => item.id === command.evidence?.supersedesEvidenceId);
        if (previous) previous.supersededByEvidenceId = evidence.id;
      }
      state.evidence.push(evidence);
    }
    emit({
      type: "evidence.uploaded",
      caseId: command.caseId,
      actor: resolution.currentActorId ?? "supplier",
      timestamp: iso(now),
      detail: evidence.filename,
    });
  }

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
    writeClaim(state, resolution, requirement, command, evidence, now, "DECLARED");
    fail(state, resolution, "EXTRACTION_REVIEW_REQUIRED", now, {
      state: "VALIDATING",
      nextAction: "Review the extracted candidate. We may have found this information.",
    });
    return;
  }

  const scopeMatch = evidenceScopeApplies(evidence, requirement.subjectId);
  if (evidence && !scopeMatch) {
    writeClaim(state, resolution, requirement, command, evidence, now, "DECLARED");
    fail(state, resolution, "SCOPE_MISMATCH", now, {
      state: "VALIDATING",
      nextAction: "Evidence is not in scope for this product. Do not promote to verified.",
    });
    return;
  }

  const trust = evidence ? "EVIDENCED" : "DECLARED";
  const claim = writeClaim(state, resolution, requirement, command, evidence, now, trust);
  const permission = writePermission(state, claim, command, now);

  if (requirement.requiredTrustLevel !== "DECLARED" && !evidence) {
    resolution.state = "EVIDENCE_REQUIRED";
    fail(state, resolution, "EVIDENCE_MISSING", now, {
      nextAction: "Ask for a document. Declared is not enough for this dataset.",
    });
    claim.ready = false;
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
    return;
  }

  markReady(state, resolution, claim, now, emit, "Supplier provided value, evidence and permission.", "SUPPLIER_RESPONSE");
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
    visibility: command.visibility ?? "value",
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
