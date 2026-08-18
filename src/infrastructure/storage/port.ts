/**
 * Infrastructure-neutral object storage. SOURCE authorization happens before
 * this port is used. Adapters must not be treated as an authorization decision.
 *
 * Domain modules must not import Supabase Storage or any provider SDK.
 */

export const IMPORT_BUCKET = "source-imports";
export const EVIDENCE_BUCKET = "source-evidence";

export type StoragePurpose = "IMPORT_SOURCE" | "EVIDENCE" | "TEMPORARY_UPLOAD" | "EXPORT";

export type StorageAvailability = "UPLOADING" | "PROCESSING" | "AVAILABLE" | "REJECTED" | "QUARANTINED";

export type ScanStatus = "PENDING" | "CLEAN" | "REJECTED" | "FAILED" | "SKIPPED_NON_PRODUCTION";

export type ObjectStorageKind = "memory" | "supabase";

export class ObjectStorageError extends Error {
  constructor(
    public readonly code: "UNAVAILABLE" | "NOT_FOUND" | "IMMUTABLE" | "TEMPORARY_ONLY" | "INTEGRITY",
    message: string
  ) {
    super(message);
    this.name = "ObjectStorageError";
  }
}

export interface StoredObjectBytes {
  bytes: Uint8Array;
  mimeType: string;
  size: number;
  sha256: string;
}

export interface ObjectMetadata {
  size: number;
  mimeType: string;
  sha256?: string;
}

export interface SignedRead {
  url: string;
  expiresAt: string;
  ttlSeconds: number;
}

export interface ObjectStorage {
  readonly kind: ObjectStorageKind;
  putImmutable(input: {
    bucket: string;
    key: string;
    bytes: Uint8Array;
    mimeType: string;
    sha256: string;
  }): Promise<void>;
  get(bucket: string, key: string): Promise<StoredObjectBytes | null>;
  head(bucket: string, key: string): Promise<ObjectMetadata | null>;
  createSignedRead(input: { bucket: string; key: string; ttlSeconds: number }): Promise<SignedRead>;
  deleteTemporary(bucket: string, key: string): Promise<void>;
  health(): Promise<"ok" | "error">;
}

export interface ScanResult {
  status: ScanStatus;
  reason?: string;
  detectedMime?: string;
}

export interface FileScanner {
  scan(input: {
    bytes: Uint8Array;
    declaredMime?: string;
    filenameHint?: string;
    purpose: StoragePurpose;
  }): Promise<ScanResult>;
}

export interface StorageObjectRecord {
  id: string;
  organisationId: string;
  bucket: string;
  objectKey: string;
  purpose: StoragePurpose;
  availability: StorageAvailability;
  originalFilename: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
  createdByPrincipalId?: string;
  createdViaPortalGrantId?: string;
  caseId?: string;
  requirementId?: string;
  evidenceId?: string;
  scanStatus: ScanStatus;
  expiresAt?: string;
  deletedAt?: string;
  createdAt: string;
  finalizedAt?: string;
  supersedesStorageObjectId?: string;
}

export function isTemporaryObjectKey(key: string): boolean {
  return key.startsWith("t/");
}
