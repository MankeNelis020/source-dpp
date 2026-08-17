/** Core objects for the Missing Information Engine. States and events, not boolean flags. */

export type TrustLevel = "DECLARED" | "EVIDENCED" | "VERIFIED" | "TRACEABLE";

export type Purpose = "DPP_COMPLIANCE" | "CUSTOMER_REQUEST" | "INTERNAL";

export type AutomationLevel = "L0" | "L1" | "L2" | "L3";

export type ResolutionCaseState =
  | "DETECTED"
  | "RESOLVING_IDENTITY"
  | "SEARCHING_EXISTING_DATA"
  | "ROUTING"
  | "REQUEST_PENDING"
  | "WAITING_RESPONSE"
  | "RESPONSE_RECEIVED"
  | "VALIDATING"
  | "EVIDENCE_REQUIRED"
  | "PERMISSION_CHECK"
  | "READY"
  | "RETURNED"
  | "MONITORING"
  | "IDENTITY_REVIEW"
  | "REVIEW_ROUTING"
  | "CONTACT_REQUIRED"
  | "WAITING_UPSTREAM"
  | "AUTHORIZATION_REQUIRED"
  | "CONFLICT"
  | "RENEWAL_REQUIRED"
  | "NDA_REQUIRED"
  | "UNRESOLVED";

export type RequestLifecycleState =
  | "DRAFT"
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "OPENED"
  | "STARTED"
  | "PARTIAL"
  | "SUBMITTED"
  | "COMPLETED"
  | "BOUNCED"
  | "UNDELIVERABLE"
  | "NO_RESPONSE"
  | "DECLINED"
  | "WRONG_CONTACT"
  | "UNKNOWN_INFORMATION"
  | "NEEDS_UPSTREAM"
  | "CONFIDENTIAL"
  | "NEEDS_NDA"
  | "LEGAL_RESTRICTION"
  | "CANNOT_VERIFY";

export type PermissionState =
  | "UNKNOWN"
  | "NOT_REQUIRED"
  | "REQUEST_REQUIRED"
  | "REQUESTED"
  | "GRANTED"
  | "RESTRICTED"
  | "DENIED"
  | "EXPIRED"
  | "REVOKED";

export type IdentityStatus =
  | "IDENTITY_MATCHED"
  | "IDENTITY_PROBABLE"
  | "IDENTITY_AMBIGUOUS"
  | "IDENTITY_CONFLICT"
  | "IDENTITY_NOT_FOUND"
  | "IDENTITY_SPLIT_REQUIRED"
  | "IDENTITY_MERGE_REQUIRED";

export type ExceptionCode =
  | "NO_RESPONSE"
  | "BOUNCED"
  | "WRONG_CONTACT"
  | "UNKNOWN"
  | "UPSTREAM_REQUIRED"
  | "DECLINED"
  | "CONFIDENTIAL"
  | "NDA_REQUIRED"
  | "LEGAL_RESTRICTION"
  | "EVIDENCE_MISSING"
  | "EVIDENCE_EXPIRED"
  | "EVIDENCE_CONFLICT"
  | "SCOPE_MISMATCH"
  | "IDENTITY_AMBIGUOUS"
  | "IDENTITY_CONFLICT"
  | "PERMISSION_DENIED"
  | "PERMISSION_REVOKED"
  | "AUTHORIZATION_REQUIRED"
  | "SOURCE_UNAVAILABLE"
  | "ALLOCATION_UNKNOWN"
  | "CHAIN_CYCLE"
  | "CONTACT_REQUIRED"
  | "EXTRACTION_REVIEW_REQUIRED"
  | "VALUE_EVIDENCE_CONFLICT"
  | "UNRESOLVABLE";

export type DeclineReason =
  | "commercially_confidential"
  | "contract_restriction"
  | "no_permission"
  | "customer_funded_evidence"
  | "legal_restriction"
  | "no_longer_supplied"
  | "information_unavailable"
  | "other";

export type AttemptMethod =
  | "reuse"
  | "authorization"
  | "email_request"
  | "secondary_contact"
  | "upstream_request"
  | "ai_extraction"
  | "human_review"
  | "procurement_escalation"
  | "renewal";

export type AttemptStatus =
  | "open"
  | "waiting"
  | "succeeded"
  | "failed"
  | "superseded"
  | "forwarded";

export type GateName =
  | "identity"
  | "value"
  | "evidence"
  | "scope"
  | "validity"
  | "permission"
  | "conflict";

export type GateResult = "pass" | "fail";

export type CaseFilter =
  | "all"
  | "needs_supplier"
  | "waiting_supplier"
  | "waiting_upstream"
  | "needs_authorization"
  | "conflict"
  | "needs_review"
  | "expired"
  | "unresolved"
  | "resolved";

export type ReuseOutcome =
  | "READY"
  | "AUTHORIZATION_REQUIRED"
  | "VERIFICATION_ONLY_AVAILABLE"
  | "PRIVATE"
  | "EXPIRED"
  | "NONE";

export type ConflictOutcome =
  | "latest_supersedes"
  | "different_scope"
  | "different_facility"
  | "different_batch"
  | "different_methodology"
  | "supplier_correction"
  | "evidence_withdrawn"
  | "manual_adjudication";

export type UpstreamContactMode = "on_behalf" | "without_customer" | "confidential";

export type UnknownChoice =
  | "ask_supplier"
  | "assign_colleague"
  | "do_not_have"
  | "does_not_exist";

export interface Actor {
  id: string;
  name: string;
  legalName: string;
  kind: "organisation" | "person" | "facility";
  vat?: string;
  lei?: string;
  country: string;
  domain?: string;
  confidential?: boolean;
}

export interface ContactPoint {
  id: string;
  actorId: string;
  role:
    | "compliance"
    | "quality"
    | "product_data"
    | "sales"
    | "account"
    | "sustainability"
    | "general";
  name: string;
  email: string;
  valid: boolean;
  lastSuccessAt?: string;
}

export interface ActorRelationship {
  id: string;
  fromActorId: string;
  toActorId: string;
  subjectId?: string;
  confidentialUpstream: boolean;
  confidentialDownstream: boolean;
  hideCustomer: boolean;
}

export interface InformationRequirement {
  id: string;
  tenantId: string;
  subjectId: string;
  subjectLabel: string;
  productIds: string[];
  propertyId: string;
  propertyLabel: string;
  datasetId: string;
  purpose: Purpose;
  requiredTrustLevel: TrustLevel;
  requiredPermissionLevel: "granted" | "not_required";
  requiredBy: string;
  priority: number;
  createdAt: string;
  resolvedAt?: string;
  linkedCaseId?: string;
}

export interface ResolutionCase {
  id: string;
  requirementId: string;
  state: ResolutionCaseState;
  currentActorId?: string;
  currentAttemptId?: string;
  blockingReason?: ExceptionCode;
  blockingExplanation?: string;
  nextAction: string;
  nextActionAt?: string;
  escalationPolicyId: string;
  ownerUserId?: string;
  ownerLabel?: string;
  openedAt: string;
  closedAt?: string;
  resolutionOutcome?: "READY" | "UNRESOLVED" | "RETURNED";
  version: number;
  identityStatus: IdentityStatus;
  identityConfidence?: number;
  requestId?: string;
  productId?: string;
  supplierId?: string;
  automationLevel: AutomationLevel;
  portalToken?: string;
  downstreamSyncOffered?: boolean;
  downstreamSyncBlocked?: boolean;
  downstreamUsages?: string[];
}

export interface ResolutionAttempt {
  id: string;
  caseId: string;
  actorId: string;
  method: AttemptMethod;
  status: AttemptStatus;
  startedAt: string;
  completedAt?: string;
  responseType?: string;
  parentAttemptId?: string;
  forwardedUpstream?: boolean;
  costEstimate: number;
  contactId?: string;
  requestId?: string;
}

export interface ResolutionException {
  id: string;
  caseId: string;
  code: ExceptionCode;
  explanation: string;
  ownerLabel: string;
  nextAction: string;
  automationPolicy: string;
  escalationDeadline: string;
  createdAt: string;
}

export interface SupplierRequest {
  id: string;
  caseId: string;
  supplierId: string;
  supplierName: string;
  status: RequestLifecycleState;
  sentAt?: string;
  dueAt: string;
  lastActivityAt: string;
  contactId?: string;
  reminderCount: number;
  executedEscalationActions: string[];
  portalToken: string;
}

export interface ClaimRecord {
  id: string;
  requirementId?: string;
  caseId?: string;
  propertyId: string;
  value: string;
  unit?: string;
  subjectId: string;
  productId: string;
  declaredByActorId: string;
  evidenceId?: string;
  validFrom?: string;
  validUntil?: string;
  trustLevel: TrustLevel;
  permissionState: PermissionState;
  purpose: Purpose;
  identityConfidence: number;
  ready: boolean;
  extractionProvenance?: "declared_by_supplier" | "ai_extracted";
  downstreamTargets?: string[];
}

export interface EvidenceRecord {
  id: string;
  filename: string;
  sha256: string;
  issuer: string;
  ownerActorId: string;
  validUntil?: string;
  expired: boolean;
  scope: EvidenceScope;
  visibility: "public" | "private" | "protected";
  linkedClaimIds: string[];
  extractedValue?: string;
  extractionConfidence?: number;
}

export interface EvidenceScope {
  kind: "company" | "facility" | "material" | "product_family" | "product" | "batch" | "item";
  id?: string;
  label: string;
}

export interface PermissionGrant {
  id: string;
  claimId: string;
  evidenceId?: string;
  granteeActorId: string;
  purpose: Purpose;
  state: PermissionState;
  visibility: "value" | "evidence_hidden" | "upstream_hidden" | "verification_only" | "restricted";
  createdAt: string;
  revokedAt?: string;
}

export interface ClaimConflict {
  id: string;
  caseId: string;
  claimId: string;
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
  resolved?: boolean;
  outcome?: ConflictOutcome;
}

export interface HumanTask {
  id: string;
  caseId: string;
  title: string;
  context: string;
  recommendedAction: string;
  ownerLabel: string;
  status: "open" | "done";
  createdAt: string;
  kind: "identity" | "conflict" | "escalation" | "contact" | "nda" | "review";
}

export interface AuditEvent {
  id: string;
  caseId?: string;
  type: string;
  actor: string;
  timestamp: string;
  policy?: string;
  policyVersion?: string;
  detail: string;
  payload?: Record<string, string | number | boolean | null>;
}

export interface EscalationPolicy {
  id: string;
  name: string;
  version: string;
  steps: EscalationStep[];
}

export interface EscalationStep {
  day: number;
  action:
    | "send"
    | "friendly_reminder"
    | "reminder_due"
    | "secondary_contact"
    | "escalate_procurement"
    | "mark_non_responsive";
  label: string;
}

export interface DownstreamDependency {
  id: string;
  claimId: string;
  target: "ERP" | "PIM" | "DPP" | "EXPORT" | "CUSTOMER_API";
  status: "active" | "flagged" | "corrected";
}

export interface EngineState {
  actors: Actor[];
  contacts: ContactPoint[];
  relationships: ActorRelationship[];
  requirements: InformationRequirement[];
  cases: ResolutionCase[];
  attempts: ResolutionAttempt[];
  exceptions: ResolutionException[];
  requests: SupplierRequest[];
  claims: ClaimRecord[];
  evidence: EvidenceRecord[];
  permissions: PermissionGrant[];
  conflicts: ClaimConflict[];
  tasks: HumanTask[];
  events: AuditEvent[];
  policies: EscalationPolicy[];
  dependencies: DownstreamDependency[];
  tenant: { id: string; name: string; identityAutoLinkThreshold: number };
  seq: number;
}

export type Command =
  | {
      type: "OPEN_REQUIREMENT";
      requirement: InformationRequirement;
      declaredSupplierId?: string;
      identityQuery?: { name?: string; vat?: string; country?: string };
    }
  | { type: "SEND_REQUEST"; caseId: string; contactId?: string }
  | { type: "TICK_NO_RESPONSE"; caseId: string }
  | { type: "SEND_REMINDER"; caseId: string }
  | { type: "ESCALATE"; caseId: string }
  | { type: "CHANGE_CONTACT"; caseId: string; contactId: string }
  | { type: "MARK_BOUNCE"; caseId: string; contactId: string }
  | {
      type: "MARK_WRONG_CONTACT";
      caseId: string;
      mode: "forward_internally" | "provide_contact";
      contact?: Omit<ContactPoint, "id" | "actorId" | "valid">;
    }
  | { type: "MARK_UNKNOWN"; caseId: string; choice: UnknownChoice }
  | {
      type: "FORWARD_UPSTREAM";
      caseId: string;
      upstream: { id?: string; name: string; legalName: string; country: string };
      mode: UpstreamContactMode;
    }
  | { type: "DECLINE"; caseId: string; reason: DeclineReason; note?: string }
  | {
      type: "SUBMIT_RESPONSE";
      caseId: string;
      value: string;
      unit?: string;
      evidence?: { filename: string; extractedValue?: string; confidence?: number; scope?: EvidenceScope };
      permission: PermissionState;
      visibility?: PermissionGrant["visibility"];
    }
  | { type: "GRANT_PERMISSION"; caseId: string }
  | { type: "DENY_PERMISSION"; caseId: string }
  | { type: "REVOKE_PERMISSION"; claimId: string }
  | { type: "EXPIRE_EVIDENCE"; evidenceId: string }
  | { type: "RESOLVE_CONFLICT"; caseId: string; outcome: ConflictOutcome }
  | {
      type: "CONFIRM_IDENTITY";
      caseId: string;
      decision: "confirm" | "reject" | "create_new" | "merge" | "split";
      actorId?: string;
    }
  | { type: "CLOSE_UNRESOLVED"; caseId: string; explanation: string }
  | { type: "ASSIGN_COLLEAGUE"; caseId: string; contact: Omit<ContactPoint, "id" | "valid"> }
  | { type: "COMPLETE_TASK"; taskId: string };

export interface EngineResult {
  state: EngineState;
  events: AuditEvent[];
  caseId?: string;
}
