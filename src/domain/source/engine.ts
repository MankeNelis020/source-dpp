import { explainException } from "./copy";
import { wouldCreateCycle } from "./cycles";
import { STANDARD_SUPPLIER_14D, nextPendingStep, upcomingStep } from "./escalation";
import { resolveIdentity } from "./identity";
import { evaluateReadiness, mayAutoLinkEvidence } from "./readiness";
import { evaluateReuse, findActiveDuplicate } from "./reuse";
import { pickContact } from "./routing";
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
  SupplierRequest,
} from "./types";

const MANUFACTURER_ID = "acme";

export function emptyState(): EngineState {
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
    tenant: { id: "acme", name: "Acme Manufacturing B.V.", identityAutoLinkThreshold: 95 },
    seq: 1,
  };
}

export function applyCommand(state: EngineState, command: Command, now: Date): EngineResult {
  const next = structuredClone(state);
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
    default:
      return done(next, events);
  }
}

function done(state: EngineState, events: AuditEvent[], caseId?: string): EngineResult {
  return { state, events, caseId };
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
      state.requirements.push({ ...requirement, linkedCaseId: duplicate.caseId });
    } else {
      existing.linkedCaseId = duplicate.caseId;
    }
    emit({
      type: "requirement.linked_existing_case",
      caseId: duplicate.caseId,
      actor: "SOURCE_SYSTEM",
      timestamp: iso(now),
      detail: `Linked to existing case ${duplicate.caseId} instead of sending a duplicate request.`,
    });
    return { state, events: state.events.slice(-1), caseId: duplicate.caseId };
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
    return { state, events: state.events.slice(-2), caseId: resolution.id };
  }

  resolution.state = "SEARCHING_EXISTING_DATA";
  const claim = state.claims.find(
    (c) => c.subjectId === requirement.subjectId && c.propertyId === requirement.propertyId
  );
  const evidence = claim?.evidenceId ? state.evidence.find((e) => e.id === claim.evidenceId) : undefined;
  const permission = claim ? state.permissions.find((p) => p.claimId === claim.id) : undefined;
  const reuse = evaluateReuse({
    requirement,
    identityMatched: identity.status === "IDENTITY_MATCHED",
    claim,
    evidence,
    permission,
    now,
  });

  if (claim) claim.caseId = resolution.id;
  if (reuse === "READY" && claim) {
    markReady(state, resolution, claim, now, emit, "Existing claim reused without a new request.");
    return { state, events: state.events.filter((e) => e.caseId === resolution.id), caseId: resolution.id };
  }
  if (reuse === "AUTHORIZATION_REQUIRED") {
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
    return { state, events: state.events.filter((e) => e.caseId === resolution.id), caseId: resolution.id };
  }
  if (reuse === "EXPIRED" && claim) {
    resolution.state = "RENEWAL_REQUIRED";
    fail(state, resolution, "EVIDENCE_EXPIRED", now, {
      nextAction: "Request replacement evidence.",
      nextActionAt: addDays(now, 7),
    });
    return { state, events: state.events.filter((e) => e.caseId === resolution.id), caseId: resolution.id };
  }

  resolution.state = "ROUTING";
  if (!resolution.currentActorId) {
    resolution.state = "REVIEW_ROUTING";
    resolution.nextAction = "Review routing. Confidence is too low to send.";
    return { state, events: state.events.filter((e) => e.caseId === resolution.id), caseId: resolution.id };
  }

  sendRequest(state, resolution.id, now, emit);
  return { state, events: state.events.filter((e) => e.caseId === resolution.id || e.type === "requirement.created"), caseId: resolution.id };
}

function sendRequest(
  state: EngineState,
  caseId: string,
  now: Date,
  emit: (e: Omit<AuditEvent, "id">) => void,
  contactId?: string
) {
  const resolution = caseById(state, caseId);
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
    title: `Find a working contact for ${state.actors.find((a) => a.id === resolution.currentActorId)?.name ?? "this supplier"}.`,
    context: "The last email bounced. SOURCE stopped waiting for the deadline.",
    recommendedAction: "Add a product-data or compliance mailbox.",
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
    evidence = {
      id: id(state, "ev"),
      filename: command.evidence.filename,
      sha256: `sha-${state.seq}`,
      issuer: state.actors.find((a) => a.id === resolution.currentActorId)?.name ?? "Supplier",
      ownerActorId: resolution.currentActorId ?? "unknown",
      validUntil: addDays(now, 400),
      expired: false,
      scope: command.evidence.scope ?? { kind: "product", id: requirement.subjectId, label: requirement.subjectLabel },
      visibility: command.visibility === "verification_only" ? "protected" : "private",
      linkedClaimIds: [],
      extractedValue: command.evidence.extractedValue,
      extractionConfidence: command.evidence.confidence,
    };
    state.evidence.push(evidence);
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

  const scopeMatch = !evidence || evidence.scope.id === requirement.subjectId || evidence.scope.kind === "product";
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
    permissionRequired: requirement.requiredPermissionLevel === "granted",
    conflict: false,
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

  markReady(state, resolution, claim, now, emit, "Supplier provided value, evidence and permission.");
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
    granteeActorId: MANUFACTURER_ID,
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
  detail: string
) {
  claim.ready = true;
  const requirement = requirementOf(state, resolution);
  requirement.resolvedAt = iso(now);
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
      permissionRequired: true,
      conflict: state.conflicts.some((c) => c.caseId === caseId && !c.resolved),
    });
    if (report.ready) markReady(state, resolution, claim, now, emit, "Authorization granted. Claim is reusable.");
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
    markReady(state, resolution, claim, now, emit, "Conflict adjudicated. Claim may return downstream.");
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
    scopeMatch: !evidence || evidence.scope.id === requirement.subjectId || evidence.scope.kind === "product",
    permission: permission?.state ?? claim?.permissionState ?? "UNKNOWN",
    permissionRequired: requirement.requiredPermissionLevel === "granted",
    conflict,
  });
}

export { mayAutoLinkEvidence };
