import type { EngineState } from "@/domain/source/types";
import type {
  ImmutableAuditEvent,
  ImportJob,
  ImportJobEvent,
  Membership,
  Organisation,
  ProcessedCommand,
  SupplierPortalGrant,
  UserRecord,
} from "@/server/source/types";

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

export interface PersistencePort {
  getOrganisation(id: string): Organisation | undefined;
  getOrganisationBySlug(slug: string): Organisation | undefined;
  getUserById(id: string): UserRecord | undefined;
  getUserByEmail(email: string): UserRecord | undefined;
  getMembership(userId: string, organisationId: string): Membership | undefined;
  listMemberships(userId: string): Membership[];

  loadEngine(organisationId: string): EngineState;
  saveEngine(organisationId: string, state: EngineState): void;

  findProcessedCommand(organisationId: string, idempotencyKey: string): ProcessedCommand | undefined;
  saveProcessedCommand(record: ProcessedCommand): void;

  findPortalGrantByTokenHash(hash: string): SupplierPortalGrant | undefined;
  savePortalGrant(grant: SupplierPortalGrant): void;
  listPortalGrantsForTenant(organisationId: string): SupplierPortalGrant[];

  appendAudit(event: ImmutableAuditEvent): void;
  listAudit(organisationId: string): ImmutableAuditEvent[];

  saveImportJob(job: ImportJob): void;
  getImportJob(id: string): ImportJob | undefined;
  listImportJobs(organisationId: string): ImportJob[];
  appendImportEvent(event: ImportJobEvent): void;
  listImportEvents(jobId: string): ImportJobEvent[];

  putEvidence(object: EvidenceObject): void;
  getEvidence(evidenceId: string): EvidenceObject | undefined;

  nextId(prefix: string): string;
}

export interface WorkflowScheduler {
  schedule(input: { name: string; runAt: Date; payload: Record<string, string> }): string;
  cancel(id: string): void;
  reschedule(id: string, at: Date): void;
  due(now: Date): { id: string; name: string; payload: Record<string, string> }[];
}

export interface EmailPort {
  send(input: { to: string; subject: string; text: string; idempotencyKey: string }): Promise<"SENT" | "ALREADY_PROCESSED">;
}

export interface ObjectStoragePort {
  putImmutable(input: { key: string; bytes: Uint8Array; sha256: string; mimeType: string }): Promise<void>;
  signGet(key: string, ttlSeconds: number): Promise<string>;
}
