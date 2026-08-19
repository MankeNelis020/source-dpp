/** Core objects for the Missing Information Engine. States and events, not boolean flags. */

export type TrustLevel = "DECLARED" | "EVIDENCED" | "VERIFIED" | "TRACEABLE";

/** How the supplier provided evidence. Independent from disclosure mode. */
export type EvidenceRoute =
  | "ORIGINAL_DOCUMENT"
  | "ALTERNATIVE_DOCUMENT"
  | "SUPPLIER_ATTESTATION"
  | "CANNOT_PROVIDE";

/** How SOURCE and the manufacturer may use what was provided. Independent from evidence route. */
export type DisclosureMode = "SHARE_SOURCE" | "PROTECTED_SOURCE" | "VERIFICATION_ONLY" | "CANNOT_DISCLOSE";

export type EvidenceReusePolicy =
  | "NO_REUSE"
  | "ASK_FOR_REUSE"
  | "REUSE_WITHIN_REQUESTING_ORGANISATION"
  | "BROADER_REUSE";

export type ReuseConsentStatus = "PENDING" | "APPROVED" | "DECLINED" | "EXPIRED" | "SUPERSEDED";

export type ReuseConsentDecision = "APPROVED" | "DECLINED";

export type RequirementAssessmentResult = "SUFFICIENT" | "INSUFFICIENT" | "CONFLICTING" | "REVIEW_REQUIRED";

/** SOURCE-classified issuer. Never accepted from a supplier portal payload. */
export type EvidenceIssuerClass =
  | "supplier"
  | "third_party"
  | "laboratory"
  | "accredited_certifier"
  | "official_registry"
  | "competent_authority";

export type CannotProvideReason =
  | "confidentiality"
  | "commercially_sensitive"
  | "unavailable"
  | "not_responsible"
  | "unknown"
  | "another_party"
  | "other";

export interface SupplierAttestation {
  legalEntity: string;
  personName: string;
  role: string;
  statement: string;
  productIds: string[];
  requirementIds: string[];
}

export interface DisclosureAgreementAcceptance {
  id: string;
  grantId?: string;
  requestId?: string;
  supplierId?: string;
  requestingOrganisationId: string;
  purpose: Purpose;
  scopeCaseIds: string[];
  scopeProductIds: string[];
  agreementId: string;
  agreementVersion: string;
  termsHash: string;
  authorityConfirmed: boolean;
  authorityConfirmedAt?: string;
  authorityConfirmedBy?: string;
  termsAccepted: boolean;
  acceptedAt?: string;
  acceptedBy?: string;
  reusePolicy: EvidenceReusePolicy;
  createdAt: string;
}

export interface RequirementEvidenceAssessment {
  id: string;
  caseId: string;
  requirementId: string;
  evidenceId?: string;
  claimId?: string;
  result: RequirementAssessmentResult;
  evidenceStrength?: TrustLevel;
  reason: string;
  assessedAt: string;
  assessedBy: "SOURCE_SYSTEM";
}

export interface CannotProvideResponse {
  id: string;
  caseId: string;
  grantId?: string;
  reason: CannotProvideReason;
  note?: string;
  disclosureAcceptanceId?: string;
  createdAt: string;
  createdBy: string;
}

/** Scope-specific reuse permission. Does not change the evidence's global reusePolicy. */
export interface EvidenceReuseConsent {
  id: string;
  key: string;
  evidenceId: string;
  caseId: string;
  requirementId: string;
  productIds: string[];
  originalCaseId?: string;
  originalRequirementId?: string;
  originalProductIds: string[];
  originalScopeLabel?: string;
  proposedScopeLabel?: string;
  requestingOrganisationId: string;
  supplierId: string;
  purpose: Purpose;
  evidenceReusePolicy: EvidenceReusePolicy;
  disclosureMode?: DisclosureMode;
  disclosureAcceptanceId?: string;
  agreementVersion?: string;
  status: ReuseConsentStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decision?: ReuseConsentDecision;
  grantId?: string;
}

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

/** Evaluated permission used by readiness. Stored PermissionState is not sufficient. */
export type PermissionDecision = "ALLOW" | "DENY" | "AUTHORIZATION_REQUIRED";

export type VisibilityPolicy =
  | "PUBLIC"
  | "CUSTOMER_ONLY"
  | "VALUE_ONLY"
  | "EVIDENCE_HIDDEN"
  | "UPSTREAM_IDENTITY_HIDDEN"
  | "VERIFICATION_ONLY"
  | "REQUEST_ACCESS"
  | "PRIVATE";

export type LegacyVisibility = "value" | "evidence_hidden" | "upstream_hidden" | "verification_only" | "restricted";

export type SubjectKind =
  | "PRODUCT"
  | "PRODUCT_FAMILY"
  | "VARIANT"
  | "BATCH"
  | "ITEM"
  | "COMPONENT"
  | "MATERIAL"
  | "RAW_MATERIAL"
  | "PACKAGING"
  | "FACILITY";

export type AssignmentSource =
  | "IMPORTED"
  | "AUTO_DETECTED"
  | "USER_ADDED"
  | "SUPPLIER_DECLARED"
  | "AI_EXTRACTED"
  | "SYSTEM_INFERRED";

/** Lineage of a derived value or relationship. Broader than AssignmentSource. */
export type ProvenanceKind =
  | AssignmentSource
  | "NORMALIZED"
  | "DETERMINISTIC_MATCH"
  | "HEURISTIC_MATCH"
  | "USER_CONFIRMED"
  | "DOCUMENT_EXTRACTED";

export type SubjectRelationKind = "contains" | "made_of" | "derived_from" | "uses";

export type SubjectMatchDecision = "MATCHED" | "PROBABLE_MATCH" | "AMBIGUOUS" | "NO_MATCH" | "REJECTED_MATCH";

export type ResolutionMechanism =
  | "ALREADY_PRESENT"
  | "NORMALIZED_EXISTING_DATA"
  | "EXISTING_CLAIM"
  | "EVIDENCE_EXTRACTION"
  | "SAME_TENANT_REUSE"
  | "CROSS_TENANT_REUSE"
  | "AUTHORIZATION"
  | "SUPPLIER_RESPONSE"
  | "UPSTREAM_RESPONSE"
  | "HUMAN_ENTRY";

export type ContactAvoidedBy =
  | "EXISTING_CLAIM"
  | "PROPAGATION"
  | "EVIDENCE_FOUND"
  | "DUPLICATE_CASE"
  | "AUTHORIZATION_ONLY"
  | "CONCURRENT_RESOLUTION";

export type MappingConfidence = "high" | "review" | "unknown";

/** Current actor/subject matcher is a prototype. Do not present scores as calibrated probabilities. */
export const IDENTITY_ENGINE_VERSION = "heuristic-v0" as const;
export type IdentityEngineVersion = typeof IDENTITY_ENGINE_VERSION;

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
  | "REUSE_CONSENT_REQUIRED"
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
  | "CONSENT_REQUIRED"
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
  primary?: boolean;
  doNotContact?: boolean;
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
  datasetVersion?: string;
  purpose: Purpose;
  requiredTrustLevel: TrustLevel;
  requiredPermissionLevel: "granted" | "not_required";
  requiredBy: string;
  priority: number;
  createdAt: string;
  resolvedAt?: string;
  linkedCaseId?: string;
  resolutionMechanism?: ResolutionMechanism;
  resolvedByClaimId?: string;
  selectedRoute?: string;
  selectedRouteReason?: string;
  preferredEvidenceRoutes?: EvidenceRoute[];
  acceptedEvidenceRoutes?: EvidenceRoute[];
  conditionallyAcceptedEvidenceRoutes?: EvidenceRoute[];
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
  identityModelVersion?: IdentityEngineVersion;
  identityCandidateIds?: string[];
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

export type EvidenceAvailability = "UPLOADING" | "PROCESSING" | "AVAILABLE" | "REJECTED" | "QUARANTINED";

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
  storageObjectId?: string;
  mimeType?: string;
  sizeBytes?: number;
  availability?: EvidenceAvailability;
  supersedesEvidenceId?: string;
  supersededByEvidenceId?: string;
  uploadedViaPortalGrantId?: string;
  uploadedByPrincipalId?: string;
  createdAt?: string;
  route?: EvidenceRoute;
  disclosureMode?: DisclosureMode;
  reusePolicy?: EvidenceReusePolicy;
  disclosureAcceptanceId?: string;
  agreementVersion?: string;
  issuerClass?: EvidenceIssuerClass;
  attestation?: SupplierAttestation;
  strengthReason?: string;
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
  visibility: VisibilityPolicy | LegacyVisibility;
  createdAt: string;
  revokedAt?: string;
  validFrom?: string;
  validUntil?: string;
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
  kind: "identity" | "conflict" | "escalation" | "contact" | "nda" | "review" | "reuse";
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

export interface CanonicalSubject {
  id: string;
  kind: SubjectKind;
  name: string;
  createdBy?: string;
  createdAt: string;
  source: AssignmentSource;
  confidence?: number;
  sourceReference?: string;
  /** Known supplier actor for this subject when the source row declared one. */
  declaredSupplierId?: string;
}

export interface SubjectRelationship {
  id: string;
  parentSubjectId: string;
  childSubjectId: string;
  kind?: SubjectRelationKind;
  quantity?: number;
  unit?: string;
  supplierActorId?: string;
  source: AssignmentSource;
  createdBy?: string;
  createdAt: string;
  confidence?: number;
}

export interface SubjectIdentifier {
  id: string;
  canonicalSubjectId: string;
  scheme: "GTIN" | "MPN" | "SKU" | "INTERNAL" | "SUPPLIER_PID" | "VAT" | "LEI" | "EORI" | "MANUFACTURER";
  value: string;
}

export interface TenantSubjectMapping {
  id: string;
  tenantId: string;
  sourceSystem: string;
  sourceRecordId: string;
  canonicalSubjectId: string;
  matchMethod: "deterministic" | "normalized" | "probabilistic" | "graph" | "human";
  confidence: number;
  decision: "auto" | "confirmed" | "rejected" | "created";
  reviewedBy?: string;
  modelVersion: IdentityEngineVersion;
  createdAt: string;
}

export interface IdentityDecision {
  id: string;
  tenantId: string;
  subject: "actor" | "canonical_subject";
  query: string;
  decision: "confirm" | "reject" | "create_new" | "merge" | "split";
  fromIds: string[];
  toId?: string;
  decidedBy: string;
  modelVersion: IdentityEngineVersion;
  createdAt: string;
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
  subjects: CanonicalSubject[];
  subjectRelationships: SubjectRelationship[];
  subjectIdentifiers: SubjectIdentifier[];
  tenantSubjectMappings: TenantSubjectMapping[];
  identityDecisions: IdentityDecision[];
  requirementOutcomes: RequirementOutcome[];
  contactAvoidances: SupplierContactAvoided[];
  pilotRuns: PilotRun[];
  requestGroups: RequestGroup[];
  disclosureAcceptances: DisclosureAgreementAcceptance[];
  requirementAssessments: RequirementEvidenceAssessment[];
  cannotProvideResponses: CannotProvideResponse[];
  reuseConsents: EvidenceReuseConsent[];
  tenant: { id: string; name: string; identityAutoLinkThreshold: number };
  seq: number;
}

export interface RequirementOutcome {
  requirementId: string;
  mechanism: ResolutionMechanism;
  claimId?: string;
  evidenceId?: string;
  recordedAt: string;
}

export interface SupplierContactAvoided {
  id: string;
  requirementId: string;
  caseId?: string;
  supplierActorId?: string;
  avoidedBy: ContactAvoidedBy;
  claimId?: string;
  evidenceId?: string;
  timestamp: string;
}

export interface PilotSnapshot {
  capturedAt: string;
  totalProducts: number;
  totalSubjects: number;
  totalSuppliers: number;
  totalRequirements: number;
  alreadyReady: number;
  missing: number;
  conflicted: number;
  identityUncertain: number;
  evidenceMissing: number;
  permissionBlocked: number;
  requirementIds: string[];
  missingRequirementIds: string[];
}

export interface CostTelemetry {
  extractionCalls: number;
  documentsProcessed: number;
  emailsQueued: number;
  backgroundJobs: number;
  storageBytes: number;
  humanReviews: number;
  aggregateBytes?: number;
  commandDurationMs?: number;
  importDurationMs?: number;
  plannerDurationMs?: number;
  propagationDurationMs?: number;
}

export interface PilotRun {
  id: string;
  organisationId: string;
  datasetId: string;
  datasetVersion: string;
  importJobId?: string;
  startedAt: string;
  executionStartedAt?: string;
  completedAt?: string;
  baseline: PilotSnapshot;
  final?: PilotSnapshot;
  cost?: CostTelemetry;
}

export interface RequestGroup {
  id: string;
  supplierActorId: string;
  propertyId: string;
  caseIds: string[];
  createdAt: string;
}

export type Command =
  | {
      type: "OPEN_REQUIREMENT";
      requirement: InformationRequirement;
      declaredSupplierId?: string;
      identityQuery?: { name?: string; vat?: string; country?: string; lei?: string; domain?: string };
      planOnly?: boolean;
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
      type: "ACCEPT_EVIDENCE_DISCLOSURE";
      caseId: string;
      authorityConfirmed: boolean;
      termsAccepted: boolean;
      agreementId: string;
      agreementVersion: string;
      portalGrantId?: string;
      reusePolicy?: EvidenceReusePolicy;
      acceptedBy?: string;
    }
  | {
      type: "SUBMIT_RESPONSE";
      caseId: string;
      value: string;
      unit?: string;
      evidence?: {
        filename: string;
        extractedValue?: string;
        confidence?: number;
        scope?: EvidenceScope;
        storageObjectId?: string;
        sha256?: string;
        mimeType?: string;
        sizeBytes?: number;
        availability?: EvidenceAvailability;
        supersedesEvidenceId?: string;
      };
      permission: PermissionState;
      visibility?: PermissionGrant["visibility"];
      evidenceRoute?: EvidenceRoute;
      disclosureMode?: DisclosureMode;
      reusePolicy?: EvidenceReusePolicy;
      disclosureAcceptanceId?: string;
      portalGrantId?: string;
      supportsCaseIds?: string[];
      attestation?: SupplierAttestation;
      cannotProvideReason?: CannotProvideReason;
      /** SOURCE-only. Portal dispatch strips this. */
      issuerClass?: EvidenceIssuerClass;
    }
  | {
      type: "DECIDE_EVIDENCE_REUSE";
      caseId: string;
      consentId?: string;
      evidenceId?: string;
      decision: ReuseConsentDecision;
      portalGrantId?: string;
      decidedBy?: string;
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
  | { type: "COMPLETE_TASK"; taskId: string }
  | {
      type: "ADD_SUBJECT";
      kind: SubjectKind;
      name: string;
      parentSubjectId?: string;
      productIds?: string[];
      supplierId?: string;
      quantity?: number;
      unit?: string;
      source?: AssignmentSource;
      createdBy?: string;
      generateRequirements?: boolean;
      planOnly?: boolean;
      externalId?: string;
      sourceReference?: string;
      relationshipKind?: SubjectRelationKind;
      identifiers?: { scheme: SubjectIdentifier["scheme"]; value: string }[];
    }
  | {
      type: "MERGE_SUBJECTS";
      fromSubjectId: string;
      toSubjectId: string;
      createdBy?: string;
    }
  | {
      type: "SPLIT_SUBJECT";
      subjectId: string;
      newName: string;
      moveRelationshipIds?: string[];
      createdBy?: string;
    }
  | {
      type: "APPLY_BULK_SUBJECT_CORRECTION";
      matchChildSubjectId: string;
      replaceChildSubjectId: string;
      createdBy?: string;
    }
  | {
      type: "CORRECT_SUBJECT_RELATIONSHIP";
      relationshipId: string;
      childSubjectId?: string;
      quantity?: number;
      unit?: string;
      createdBy?: string;
    }
  | { type: "REMOVE_SUBJECT_RELATIONSHIP"; relationshipId: string; createdBy?: string }
  | {
      type: "MARK_SUBJECT_UNKNOWN";
      subjectId: string;
      createdBy?: string;
    };

export interface EngineResult {
  state: EngineState;
  events: AuditEvent[];
  caseId?: string;
}
