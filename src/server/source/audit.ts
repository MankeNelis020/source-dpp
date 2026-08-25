import type { AuditEvent, EngineState } from "@/domain/source/types";
import { DISCLOSURE_POLICY_VERSION, evaluateActorDisclosure, isConfidentialActor, opaqueEvidenceRef } from "./disclosure";
import type { AuditView, ImmutableAuditEvent, PortalPrincipal } from "./types";

export interface AuditProjection {
  id: string;
  action: string;
  type?: string;
  timestamp: string;
  createdAt?: string;
  result?: string;
  detail: string;
  policy?: string;
  resourceType?: string;
  resourceId?: string;
  publicContext?: Record<string, unknown>;
}

const TENANT_COPY: Record<string, string> = {
  SEND_REQUEST: "Supplier request queued.",
  SEND_REMINDER: "Reminder queued.",
  SUBMIT_RESPONSE: "Response recorded.",
  ACCEPT_EVIDENCE_DISCLOSURE: "Disclosure terms accepted.",
  DECIDE_EVIDENCE_REUSE: "Evidence reuse decision recorded.",
  ASSIGN_COLLEAGUE: "Request delegated to a colleague.",
  FORWARD_UPSTREAM: "Case forwarded upstream.",
  MARK_UNKNOWN: "Unknown-information path recorded.",
  MARK_WRONG_CONTACT: "Wrong-contact path recorded.",
  MARK_BOUNCE: "Contact marked invalid.",
  GRANT_PERMISSION: "Permission updated.",
  DENY_PERMISSION: "Permission updated.",
  REVOKE_PERMISSION: "Permission revoked.",
  EXPIRE_EVIDENCE: "Evidence validity changed.",
  EVIDENCE_VIEWED_PRIVATE: "Authorized evidence read.",
  EVIDENCE_SIGNED_URL: "Authorized evidence download.",
  OUTBOX_DEAD_LETTER: "Automated delivery failed and needs attention.",
  "request.sent": "Request queued.",
  AUTO_REMINDER_SENT: "Automatic reminder sent.",
  "request.forwarded": "Forwarded upstream.",
  "request.delegated": "Delegated to a colleague.",
  "request.upstream_identified": "Upstream owner identified.",
  "request.bounced": "Contact marked invalid after bounce.",
  "evidence.uploaded": "Evidence recorded.",
  "evidence.attestation_submitted": "Authorised declaration recorded.",
  "evidence.cannot_provide": "Supplier could not provide evidence.",
  "authority.confirmed": "Supplier confirmed authority.",
  "disclosure.terms_accepted": "Data Disclosure Terms accepted.",
  "reuse.candidate_created": "Existing evidence may be relevant. Reuse permission requested.",
  "reuse.consent_requested": "Waiting for supplier reuse permission.",
  "reuse.consent_approved": "Supplier authorised reuse for this request.",
  "reuse.consent_declined": "Supplier declined reuse for this request.",
  "evidence.reused": "Existing evidence was reused for a compatible request.",
  "case.ready": "Case became ready.",
  "claim.conflict_detected": "Conflicting values need review.",
  "identity.review_required": "Identity review required.",
  "case.unresolved": "Case closed unresolved.",
  "case.escalated": "Case escalated.",
};

export function auditCopy(action: string, publicContext?: Record<string, unknown>): string {
  const fromMap = TENANT_COPY[action];
  if (fromMap) return fromMap;
  const commandType = typeof publicContext?.commandType === "string" ? publicContext.commandType : undefined;
  if (commandType && TENANT_COPY[commandType]) return TENANT_COPY[commandType];
  return "SOURCE recorded an authorized action.";
}

export function projectStructuredAudit(
  event: ImmutableAuditEvent,
  view: AuditView
): AuditProjection {
  const result = event.result === "ok" || event.result === "success" ? "success" : "failure";
  const publicContext = event.publicContext ?? {};
  const projection: AuditProjection = {
    id: event.id,
    action: event.action,
    timestamp: event.createdAt,
    createdAt: event.createdAt,
    result,
    detail: auditCopy(event.action, publicContext),
    resourceType: event.resourceType,
    resourceId: view === "internal" ? event.resourceId ?? event.resource : publicResourceId(event),
    publicContext: view === "portal" ? portalPublicContext(publicContext) : publicContext,
  };
  if (view === "internal") {
    projection.detail = event.detail || projection.detail;
    projection.publicContext = {
      ...publicContext,
      privateContext: event.privateContext,
      protectedReferences: event.protectedReferences,
    };
  }
  return projection;
}

export function projectDomainEvent(state: EngineState, event: AuditEvent, view: AuditView): AuditProjection {
  const actorDecision = evaluateActorDisclosure(state, event.actor);
  const publicContext: Record<string, unknown> = {
    eventType: event.type,
    caseId: event.caseId,
  };
  if (event.payload && view === "internal") {
    publicContext.payload = event.payload;
  }
  let detail = auditCopy(event.type, publicContext);
  if (view === "internal") {
    detail = event.detail;
  } else if (event.type === "evidence.uploaded") {
    detail = "Evidence recorded.";
  }
  const projection: AuditProjection = {
    id: event.id,
    action: event.type,
    type: event.type,
    timestamp: event.timestamp,
    detail,
    policy: event.policy,
    publicContext,
  };
  if (!actorDecision.canRevealIdentity) {
    void event.actor;
  }
  if (view !== "internal") {
    projection.detail = fallbackSanitizeText(state, projection.detail);
  }
  return projection;
}

export function projectPortalAudit(
  events: AuditProjection[],
  principal: PortalPrincipal
): AuditProjection[] {
  return events.filter((event) => {
    const caseId = event.publicContext?.caseId;
    if (typeof caseId === "string") return principal.allowedCaseIds.includes(caseId);
    return false;
  });
}

export function fallbackSanitizeText(state: EngineState, text: string): string {
  let next = text;
  for (const actor of state.actors) {
    if (!isConfidentialActor(state, actor.id)) continue;
    next = next.split(actor.name).join("verified upstream source");
    next = next.split(actor.legalName).join("verified upstream source");
    next = next.split(actor.id).join("protected");
  }
  return next;
}

export function structuredCommandAudit(input: {
  id: string;
  organisationId: string;
  principalId: string;
  action: string;
  caseId?: string;
  commandId: string;
  result: "success" | "failure";
  eventTypes: string[];
  createdAt: string;
  reason?: string;
  privateDetail?: string;
}): ImmutableAuditEvent {
  return {
    id: input.id,
    organisationId: input.organisationId,
    principalId: input.principalId,
    action: input.action,
    resourceType: input.caseId ? "ResolutionCase" : undefined,
    resourceId: input.caseId,
    resource: input.caseId,
    result: input.result,
    commandId: input.commandId,
    reason: input.reason,
    publicContext: {
      commandType: input.action,
      caseId: input.caseId,
      eventTypes: input.eventTypes,
      policyVersion: DISCLOSURE_POLICY_VERSION,
    },
    privateContext: input.privateDetail ? { diagnostic: input.privateDetail } : undefined,
    policyVersion: DISCLOSURE_POLICY_VERSION,
    createdAt: input.createdAt,
  };
}

function publicResourceId(event: ImmutableAuditEvent): string | undefined {
  if (event.resourceType === "ResolutionCase") return event.resourceId ?? event.resource;
  return undefined;
}

function portalPublicContext(context: Record<string, unknown>): Record<string, unknown> {
  return {
    commandType: context.commandType,
    caseId: context.caseId,
    eventTypes: context.eventTypes,
  };
}

export function opaqueActorRef(organisationId: string, actorId: string): string {
  return opaqueEvidenceRef(organisationId, `actor:${actorId}`).replace(/^evr1_/, "act1_");
}
