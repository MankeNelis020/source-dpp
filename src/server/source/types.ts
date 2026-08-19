import type { Command } from "@/domain/source/types";

export type Role =
  | "OWNER"
  | "ADMIN"
  | "MEMBER"
  | "COMPLIANCE_MANAGER"
  | "PROCUREMENT_MANAGER"
  | "DATA_STEWARD"
  | "REVIEWER"
  | "AUDITOR";

export type MembershipStatus = "ACTIVE" | "SUSPENDED";

export type AuthenticationMethod = "SUPABASE" | "TEST";

export type Capability =
  | "claim:read"
  | "claim:approve"
  | "evidence:read"
  | "evidence:read_private"
  | "evidence:export"
  | "supplier:request"
  | "supplier:manage_contact"
  | "permission:request"
  | "permission:grant"
  | "permission:revoke"
  | "identity:review"
  | "identity:merge"
  | "identity:split"
  | "integration:manage"
  | "organisation:manage"
  | "catalogue:write"
  | "import:manage"
  | "case:read"
  | "case:resolve"
  | "audit:read_internal";

export type PortalCommand =
  | "VIEW_REQUIREMENT"
  | "SUBMIT_RESPONSE"
  | "UPLOAD_EVIDENCE"
  | "FORWARD_UPSTREAM"
  | "ASSIGN_COLLEAGUE"
  | "DECLINE"
  | "REQUEST_CLARIFICATION"
  | "MARK_UNKNOWN"
  | "MARK_WRONG_CONTACT";

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  country?: string;
  website?: string;
  createdBy?: string;
  createdAt?: string;
}

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
}

export interface Membership {
  id: string;
  userId: string;
  organisationId: string;
  role: Role;
  capabilities: Capability[];
  status?: MembershipStatus;
  createdBy?: string;
  createdAt?: string;
}

export interface OrganisationInvitation {
  id: string;
  organisationId: string;
  emailNormalized: string;
  role: Role;
  tokenHash: string;
  expiresAt: string;
  acceptedAt?: string;
  revokedAt?: string;
  createdBy: string;
  createdAt: string;
}

export interface IdentityCommandRecord {
  userId: string;
  idempotencyKey: string;
  commandType: string;
  organisationId?: string;
  result: Record<string, unknown>;
  processedAt: string;
}

export interface Principal {
  kind: "user";
  userId: string;
  organisationId: string;
  membershipId: string;
  roles: Role[];
  capabilities: Capability[];
  email: string;
  authenticationMethod: AuthenticationMethod;
}

export interface PortalPrincipal {
  kind: "supplier_portal";
  grantId: string;
  actorId: string;
  organisationId: string;
  allowedCaseIds: string[];
  allowedRequirementIds: string[];
  allowedCommands: PortalCommand[];
}

export interface SystemPrincipal {
  kind: "system";
  organisationId: string;
  capabilities: Capability[];
}

export function sourceSystemPrincipal(organisationId: string): SystemPrincipal {
  return {
    kind: "system",
    organisationId,
    capabilities: ["supplier:request", "case:read", "case:resolve", "supplier:manage_contact"],
  };
}

export type AnyPrincipal = Principal | PortalPrincipal | SystemPrincipal;

export interface CommandEnvelope<T extends Command = Command> {
  commandId: string;
  idempotencyKey: string;
  principalId: string;
  organisationId: string;
  issuedAt: string;
  expectedVersion?: number;
  command: T;
}

export interface SupplierPortalGrant {
  id: string;
  tokenHash: string;
  actorId: string;
  tenantContextId: string;
  allowedCaseIds: string[];
  allowedRequirementIds: string[];
  allowedCommands: PortalCommand[];
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
}

export interface ProcessedCommand {
  id: string;
  idempotencyKey: string;
  organisationId: string;
  principalId: string;
  commandType: string;
  result: CommandOutcome;
  processedAt: string;
}

export type AuditView = "internal" | "tenant" | "portal";

export type AuditResult = "success" | "failure";

export interface ProtectedReference {
  kind: "actor" | "evidence" | "relationship" | "organisation" | "case";
  opaqueRef: string;
}

export interface ImmutableAuditEvent {
  id: string;
  organisationId?: string;
  principalId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  resource?: string;
  result: AuditResult | "ok" | "denied" | "error";
  policyVersion?: string;
  commandId?: string;
  requestId?: string;
  reason?: string;
  /** Generated at projection time. Must not be the confidentiality control. */
  detail?: string;
  publicContext?: Record<string, unknown>;
  privateContext?: Record<string, unknown>;
  protectedReferences?: ProtectedReference[];
  createdAt: string;
}

export type CommandErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "RESOURCE_UNAVAILABLE"
  | "CASE_CHANGED"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "EXPIRED"
  | "REVOKED"
  | "FILE_TYPE_NOT_ALLOWED"
  | "STORAGE_UNAVAILABLE";

export class SourceError extends Error {
  constructor(
    public readonly code: CommandErrorCode,
    message: string,
    public readonly httpStatus: number
  ) {
    super(message);
    this.name = "SourceError";
  }
}

export type CommandOutcome =
  | {
      status: "ok" | "ALREADY_PROCESSED";
      caseId?: string;
      version?: number;
      events: { type: string; detail: string }[];
      sideEffects: { type: string; key: string }[];
    }
  | { status: "error"; code: CommandErrorCode; message: string };

export interface ImportJob {
  id: string;
  organisationId: string;
  state:
    | "UPLOADED"
    | "PARSING"
    | "NORMALIZING"
    | "IDENTITY_RESOLUTION"
    | "RELATIONSHIP_BUILDING"
    | "MATERIAL_DETECTION"
    | "EVIDENCE_MATCHING"
    | "REQUIREMENT_GENERATION"
    | "RESOLUTION_PLANNING"
    | "COMPLETE"
    | "FAILED"
    | "PARTIAL";
  currentStage?: string;
  processedCount: number;
  totalCount: number;
  warningCount: number;
  errorCount: number;
  reviewCount: number;
  startedAt?: string;
  completedAt?: string;
  mapping: Record<string, string>;
  mappingConfidence?: Record<string, "high" | "review" | "unknown">;
  rawRecords?: RawImportRecord[];
  sourceStorageObjectIds?: {
    products?: string;
    suppliers?: string;
    bom?: string;
    materials?: string;
  };
  sourceFiles?: Partial<
    Record<
      "products" | "suppliers" | "bom" | "materials",
      { filename: string; sizeBytes: number; storageObjectId: string; mimeType?: string }
    >
  >;
  summary?: {
    products: number;
    suppliers: number;
    relationships: number;
    productSupplierRelationships?: number;
    materials?: number;
    requirements: number;
    autoResolvable: number;
    needsAttention: number;
    autoMapped?: number;
    reviewRows?: number;
    warningRows?: number;
    errorRows?: number;
    outreachStarted?: boolean;
    identityReviews?: number;
  };
}

export interface RawImportRecord {
  id: string;
  importJobId: string;
  sourceFile: string;
  sheet?: string;
  row: number;
  raw: Record<string, string>;
  normalized: Record<string, string>;
  mappingVersion: string;
  status: "accepted" | "warning" | "error" | "review";
  createdAt: string;
}

export interface ImportMappingProfile {
  id: string;
  organisationId: string;
  sourceFormat: string;
  mapping: Record<string, string>;
  mappingVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportJobEvent {
  id: string;
  jobId: string;
  type: string;
  payload: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export const PORTAL_ALLOWED_DEFAULT: PortalCommand[] = [
  "VIEW_REQUIREMENT",
  "SUBMIT_RESPONSE",
  "UPLOAD_EVIDENCE",
  "FORWARD_UPSTREAM",
  "ASSIGN_COLLEAGUE",
  "DECLINE",
  "REQUEST_CLARIFICATION",
  "MARK_UNKNOWN",
  "MARK_WRONG_CONTACT",
];

export const PORTAL_FORBIDDEN = [
  "VIEW_OTHER_CASES",
  "VIEW_CUSTOMER_GRAPH",
  "VIEW_OTHER_SUPPLIERS",
  "VIEW_PRIVATE_EVIDENCE",
  "IDENTITY_MERGE",
  "RESOLVE_CONFLICT",
  "ADMIN_ACTIONS",
] as const;
