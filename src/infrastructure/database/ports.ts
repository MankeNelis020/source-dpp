import type { EngineState, PermissionState, Purpose, TrustLevel, VisibilityPolicy, LegacyVisibility } from "@/domain/source/types";
import type {
  ImmutableAuditEvent,
  ImportJob,
  ImportJobEvent,
  ImportMappingProfile,
  Membership,
  Organisation,
  ProcessedCommand,
  SupplierPortalGrant,
  UserRecord,
} from "@/server/source/types";
import type { OutboxRecord, OutboxStatus } from "@/infrastructure/outbox/types";

export interface EvidenceObject {
  evidenceId: string;
  ownerActorId: string;
  organisationId?: string;
  storageKey: string;
  sha256: string;
  mimeType: string;
  size: number;
  originalFilename: string;
  issuer?: string;
  uploadedBy?: string;
  createdAt: string;
  validFrom?: string;
  validUntil?: string;
  visibility: string;
  bytes?: Uint8Array;
}

export interface SessionRecord {
  id: string;
  userId: string;
  organisationId: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
}

export interface ShareableTrustCandidate {
  trustLevel: TrustLevel;
  permissionState: PermissionState;
  purpose: Purpose;
  validUntil?: string;
  expired: boolean;
  identityMatched: boolean;
  visibility?: VisibilityPolicy | LegacyVisibility;
}

export type MaybePromise<T> = T | Promise<T>;

export interface PersistencePort {
  getOrganisation(id: string): MaybePromise<Organisation | undefined>;
  getOrganisationBySlug(slug: string): MaybePromise<Organisation | undefined>;
  getUserById(id: string): MaybePromise<UserRecord | undefined>;
  getUserByEmail(email: string): MaybePromise<UserRecord | undefined>;
  getMembership(userId: string, organisationId: string): MaybePromise<Membership | undefined>;
  listMemberships(userId: string): MaybePromise<Membership[]>;

  loadEngine(organisationId: string): MaybePromise<EngineState>;
  saveEngine(organisationId: string, state: EngineState): MaybePromise<void>;

  saveMappingProfile?(profile: ImportMappingProfile): MaybePromise<void>;
  getMappingProfile?(organisationId: string, sourceFormat: string): MaybePromise<ImportMappingProfile | undefined>;

  findProcessedCommand(organisationId: string, idempotencyKey: string): MaybePromise<ProcessedCommand | undefined>;
  saveProcessedCommand(record: ProcessedCommand): MaybePromise<void>;

  findPortalGrantByTokenHash(hash: string): MaybePromise<SupplierPortalGrant | undefined>;
  savePortalGrant(grant: SupplierPortalGrant): MaybePromise<void>;
  listPortalGrantsForTenant(organisationId: string): MaybePromise<SupplierPortalGrant[]>;

  appendAudit(event: ImmutableAuditEvent): MaybePromise<void>;
  listAudit(organisationId: string): MaybePromise<ImmutableAuditEvent[]>;

  saveImportJob(job: ImportJob): MaybePromise<void>;
  getImportJob(id: string): MaybePromise<ImportJob | undefined>;
  listImportJobs(organisationId: string): MaybePromise<ImportJob[]>;
  appendImportEvent(event: ImportJobEvent): MaybePromise<void>;
  listImportEvents(jobId: string): MaybePromise<ImportJobEvent[]>;

  putEvidence(object: EvidenceObject): MaybePromise<void>;
  getEvidence(evidenceId: string): MaybePromise<EvidenceObject | undefined>;

  nextId(prefix: string): string;

  transaction<T>(fn: (tx: PersistencePort) => Promise<T> | T): Promise<T>;

  insertOutbox(record: OutboxRecord): MaybePromise<boolean>;
  claimOutboxBatch(limit: number, now?: Date): MaybePromise<OutboxRecord[]>;
  markOutboxSucceeded(id: string, processedAt?: Date): MaybePromise<void>;
  markOutboxFailed(id: string, error: string, nextAttemptAt: Date, deadLetter?: boolean): MaybePromise<void>;
  getOutbox(id: string): MaybePromise<OutboxRecord | undefined>;
  listOutbox(status?: OutboxStatus, organisationId?: string): MaybePromise<OutboxRecord[]>;
  countOutbox(status: OutboxStatus): MaybePromise<number>;

  saveSession(session: SessionRecord): MaybePromise<void>;
  getSession(id: string): MaybePromise<SessionRecord | undefined>;
  revokeSession(id: string, at?: Date): MaybePromise<void>;

  findShareableTrustCandidates(input: {
    requesterOrganisationId: string;
    subjectId: string;
    propertyId: string;
  }): MaybePromise<ShareableTrustCandidate[]>;
}

export interface WorkflowScheduler {
  schedule(input: { name: string; runAt: Date; payload: Record<string, string> }): string;
  cancel(id: string): void;
  reschedule(id: string, at: Date): void;
  due(now: Date): { id: string; name: string; payload: Record<string, string> }[];
}

export interface EmailPort {
  send(input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    idempotencyKey: string;
  }): Promise<"SENT" | "ALREADY_PROCESSED">;
}

export interface ObjectStoragePort {
  putImmutable(input: { key: string; bytes: Uint8Array; sha256: string; mimeType: string }): Promise<void>;
  signGet(key: string, ttlSeconds: number): Promise<string>;
}

export class MemoryEmailPort implements EmailPort {
  sent: { to: string; subject: string; text: string; html?: string; idempotencyKey: string }[] = [];
  failWith?: Error;

  async send(input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    idempotencyKey: string;
  }): Promise<"SENT" | "ALREADY_PROCESSED"> {
    if (this.failWith) throw this.failWith;
    if (this.sent.some((row) => row.idempotencyKey === input.idempotencyKey)) return "ALREADY_PROCESSED";
    this.sent.push({
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      idempotencyKey: input.idempotencyKey,
    });
    return "SENT";
  }
}
