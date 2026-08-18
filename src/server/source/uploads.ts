import { randomUUID } from "node:crypto";
import type { PersistencePort } from "@/infrastructure/database/ports";
import { METRICS, metricInc, logOperational } from "@/infrastructure/observability/metrics";
import type { ObjectStorage, StorageObjectRecord, StoragePurpose } from "@/infrastructure/storage/port";
import { EVIDENCE_BUCKET, IMPORT_BUCKET, ObjectStorageError } from "@/infrastructure/storage/port";
import { AllowlistFileScanner, basenameHint, rejectUnsafeObjectPath, sha256Hex } from "@/infrastructure/storage/files";
import { getRuntimeObjectStorage, getSourceEnvironment } from "@/infrastructure/runtime";
import type { AnyPrincipal } from "@/server/source/types";
import { SourceError } from "@/server/source/types";
import { hasCapability } from "@/server/source/authorization";
import { emptyState } from "@/domain/source/engine";
import type { EngineState, EvidenceRecord, EvidenceScope } from "@/domain/source/types";

const scanner = new AllowlistFileScanner();

export interface CreateUploadIntentInput {
  purpose: StoragePurpose;
  filenameHint?: string;
  mimeHint?: string;
  sizeHint?: number;
  caseId?: string;
  requirementId?: string;
  supersedesStorageObjectId?: string;
  objectKey?: string;
  bucket?: string;
  organisationId?: string;
}

export async function createUploadIntent(args: {
  store: PersistencePort;
  principal: AnyPrincipal;
  input: CreateUploadIntentInput;
  now?: Date;
  objectStorage?: ObjectStorage;
}): Promise<{ id: string; purpose: StoragePurpose; expiresAt: string }> {
  const now = args.now ?? new Date();
  rejectClientChosenLocation(args.input);
  const purpose = args.input.purpose === "EXPORT" ? "EXPORT" : args.input.purpose;
  if (purpose !== "IMPORT_SOURCE" && purpose !== "EVIDENCE") {
    throw new SourceError("VALIDATION", "Unsupported upload purpose.", 400);
  }
  await authorizeUpload(args.store, args.principal, purpose, args.input.caseId, args.input.requirementId, now);

  const env = safeEnv();
  const ttlHours = env?.tempUploadTtlHours ?? 24;
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();
  const objectId = args.store.nextId("so");
  const objectKey = `t/${randomUUID()}`;
  const bucket = purpose === "IMPORT_SOURCE" ? env?.importBucket ?? IMPORT_BUCKET : env?.evidenceBucket ?? EVIDENCE_BUCKET;
  const record: StorageObjectRecord = {
    id: objectId,
    organisationId: args.principal.organisationId,
    bucket,
    objectKey,
    purpose: "TEMPORARY_UPLOAD",
    availability: "UPLOADING",
    originalFilename: basenameHint(args.input.filenameHint),
    mimeType: args.input.mimeHint,
    sizeBytes: args.input.sizeHint,
    createdByPrincipalId:
      args.principal.kind === "user"
        ? args.principal.userId
        : args.principal.kind === "supplier_portal"
          ? args.principal.grantId
          : "SOURCE_SYSTEM",
    createdViaPortalGrantId: args.principal.kind === "supplier_portal" ? args.principal.grantId : undefined,
    caseId: args.input.caseId,
    requirementId: args.input.requirementId,
    scanStatus: "PENDING",
    expiresAt,
    createdAt: now.toISOString(),
    supersedesStorageObjectId: args.input.supersedesStorageObjectId,
  };
  await args.store.saveStorageObject(record);
  metricInc(METRICS.storageUploadsStarted);
  logOperational("storage.upload_started", {
    organisationId: args.principal.organisationId,
    purpose,
    viaPortal: args.principal.kind === "supplier_portal",
  });
  await args.store.appendAudit({
    id: args.store.nextId("aud"),
    organisationId: args.principal.organisationId,
    principalId: record.createdByPrincipalId,
    action: purpose === "IMPORT_SOURCE" ? "IMPORT_SOURCE_UPLOAD_STARTED" : "EVIDENCE_UPLOAD_STARTED",
    resourceType: "StorageObject",
    resourceId: objectId,
    result: "success",
    createdAt: now.toISOString(),
    policyVersion: "b2-v1",
  });
  return { id: objectId, purpose, expiresAt };
}

export async function putUploadBytes(args: {
  store: PersistencePort;
  principal: AnyPrincipal;
  uploadId: string;
  bytes: Uint8Array;
  filenameHint?: string;
  now?: Date;
  objectStorage?: ObjectStorage;
}): Promise<StorageObjectRecord> {
  const now = args.now ?? new Date();
  const storage = args.objectStorage ?? getRuntimeObjectStorage();
  const record = await requireOwnedUpload(args.store, args.principal, args.uploadId, now);
  if (record.availability !== "UPLOADING") {
    throw new SourceError("CONFLICT", "This upload can no longer accept bytes.", 409);
  }
  const expectedPurpose = record.createdViaPortalGrantId ? "EVIDENCE" : inferFinalPurpose(record);
  const scan = await scanner.scan({
    bytes: args.bytes,
    filenameHint: args.filenameHint ?? record.originalFilename,
    purpose: expectedPurpose,
  });
  if (scan.status === "REJECTED") {
    await quarantine(args.store, storage, record, now, scan.reason ?? "File type not allowed");
    throw new SourceError("FILE_TYPE_NOT_ALLOWED", scan.reason ?? "This file type is not allowed.", 400);
  }
  if (scan.status === "FAILED") {
    await quarantine(args.store, storage, record, now, "scan failed");
    throw new SourceError("VALIDATION", "This file could not be processed.", 400);
  }
  const digest = sha256Hex(args.bytes);
  try {
    await storage.putImmutable({
      bucket: record.bucket,
      key: record.objectKey,
      bytes: args.bytes,
      mimeType: scan.detectedMime ?? "application/octet-stream",
      sha256: digest,
    });
  } catch (error) {
    metricInc(METRICS.storageUploadFailures);
    throw storageError(error, "We couldn't store this file. Nothing has been added yet.");
  }
  const next: StorageObjectRecord = {
    ...record,
    originalFilename: basenameHint(args.filenameHint ?? record.originalFilename),
    mimeType: scan.detectedMime,
    sizeBytes: args.bytes.byteLength,
    sha256: digest,
    scanStatus: "CLEAN",
    availability: "PROCESSING",
  };
  await args.store.saveStorageObject(next);
  metricInc(METRICS.storageBytesStored, args.bytes.byteLength);
  return next;
}

export async function finalizeUpload(args: {
  store: PersistencePort;
  principal: AnyPrincipal;
  uploadId: string;
  now?: Date;
  objectStorage?: ObjectStorage;
}): Promise<StorageObjectRecord> {
  const now = args.now ?? new Date();
  const storage = args.objectStorage ?? getRuntimeObjectStorage();
  const record = await requireOwnedUpload(args.store, args.principal, args.uploadId, now);
  try {
    await authorizeUpload(
      args.store,
      args.principal,
      inferFinalPurpose(record),
      record.caseId,
      record.requirementId,
      now
    );
  } catch (error) {
    if (record.availability !== "AVAILABLE") {
      await quarantine(args.store, storage, record, now, "authorization ended before finalization");
    }
    throw error;
  }

  if (record.availability === "AVAILABLE") return record;
  if (record.availability === "REJECTED" || record.availability === "QUARANTINED") {
    throw new SourceError("VALIDATION", "This upload was rejected.", 400);
  }

  const stored = await storage.get(record.bucket, record.objectKey).catch((error) => {
    throw storageError(error, "We couldn't store this file. Nothing has been added yet.");
  });
  if (!stored) {
    throw new SourceError("VALIDATION", "Upload bytes were not found. Nothing has been added yet.", 400);
  }
  const digest = sha256Hex(stored.bytes);
  if (record.sha256 && record.sha256 !== digest) {
    await quarantine(args.store, storage, record, now, "hash mismatch");
    throw new SourceError("VALIDATION", "Stored file hash does not match uploaded bytes.", 400);
  }
  const scan = await scanner.scan({
    bytes: stored.bytes,
    filenameHint: record.originalFilename,
    purpose: inferFinalPurpose(record),
  });
  if (scan.status !== "CLEAN") {
    await quarantine(args.store, storage, record, now, scan.reason ?? "rejected");
    throw new SourceError("FILE_TYPE_NOT_ALLOWED", scan.reason ?? "This file type is not allowed.", 400);
  }

  const purpose = inferFinalPurpose(record);
  const finalized: StorageObjectRecord = {
    ...record,
    purpose,
    availability: "AVAILABLE",
    sha256: digest,
    sizeBytes: stored.size,
    mimeType: scan.detectedMime ?? stored.mimeType,
    scanStatus: "CLEAN",
    finalizedAt: now.toISOString(),
    expiresAt: undefined,
  };
  await args.store.saveStorageObject(finalized);

  if (purpose === "IMPORT_SOURCE") {
    await args.store.appendAudit({
      id: args.store.nextId("aud"),
      organisationId: finalized.organisationId,
      principalId: finalized.createdByPrincipalId,
      action: "IMPORT_SOURCE_UPLOADED",
      resourceType: "StorageObject",
      resourceId: finalized.id,
      result: "success",
      createdAt: now.toISOString(),
      policyVersion: "b2-v1",
    });
    logOperational("storage.import_file_stored", { organisationId: finalized.organisationId });
  } else {
    const evidence = await attachEvidenceRecord(args.store, args.principal, finalized, now);
    finalized.evidenceId = evidence.id;
    await args.store.saveStorageObject(finalized);
    await args.store.appendAudit({
      id: args.store.nextId("aud"),
      organisationId: finalized.organisationId,
      principalId: finalized.createdByPrincipalId,
      action: finalized.supersedesStorageObjectId ? "EVIDENCE_REPLACED" : "EVIDENCE_UPLOADED",
      resourceType: "Evidence",
      resourceId: evidence.id,
      result: "success",
      createdAt: now.toISOString(),
      policyVersion: "b2-v1",
    });
    logOperational("storage.evidence_stored", { organisationId: finalized.organisationId });
  }
  metricInc(METRICS.storageFinalizations);
  return finalized;
}

export async function cleanupExpiredUploads(args: {
  store: PersistencePort;
  objectStorage?: ObjectStorage;
  now?: Date;
}): Promise<{ deleted: number }> {
  const now = args.now ?? new Date();
  const storage = args.objectStorage ?? getRuntimeObjectStorage();
  const expired = await args.store.listExpiredTemporaryUploads(now);
  let deleted = 0;
  for (const record of expired) {
    try {
      await storage.deleteTemporary(record.bucket, record.objectKey);
    } catch (error) {
      if (!(error instanceof ObjectStorageError && error.code === "NOT_FOUND")) {
        logOperational("storage.temp_cleanup_failed", { organisationId: record.organisationId });
      }
    }
    await args.store.saveStorageObject({
      ...record,
      deletedAt: now.toISOString(),
      availability: record.availability === "AVAILABLE" ? record.availability : "REJECTED",
    });
    deleted += 1;
  }
  metricInc(METRICS.storageTempCleanup, deleted);
  return { deleted };
}

export async function loadStoredText(args: {
  store: PersistencePort;
  objectStorage: ObjectStorage;
  organisationId: string;
  storageObjectId: string;
}): Promise<string> {
  const record = await args.store.getStorageObject(args.storageObjectId);
  if (!record || record.organisationId !== args.organisationId || record.deletedAt) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
  const stored = await args.objectStorage.get(record.bucket, record.objectKey);
  if (!stored) {
    throw new SourceError("STORAGE_UNAVAILABLE", "The original file is temporarily unavailable.", 503);
  }
  if (record.sha256 && record.sha256 !== sha256Hex(stored.bytes)) {
    throw new SourceError("VALIDATION", "Stored file hash does not match uploaded bytes.", 400);
  }
  return Buffer.from(stored.bytes).toString("utf8");
}

function inferFinalPurpose(record: StorageObjectRecord): StoragePurpose {
  if (record.purpose !== "TEMPORARY_UPLOAD") return record.purpose;
  return record.createdViaPortalGrantId || record.caseId ? "EVIDENCE" : record.bucket.includes("evidence") ? "EVIDENCE" : "IMPORT_SOURCE";
}

function rejectClientChosenLocation(input: CreateUploadIntentInput) {
  rejectUnsafeObjectPath(input.objectKey, "object key");
  rejectUnsafeObjectPath(input.bucket, "bucket");
  rejectUnsafeObjectPath(input.organisationId, "organisation");
  if (input.filenameHint && (input.filenameHint.includes("..") || input.filenameHint.includes("\0"))) {
    throw new SourceError("VALIDATION", "Unsafe filename.", 400);
  }
}

async function authorizeUpload(
  store: PersistencePort,
  principal: AnyPrincipal,
  purpose: StoragePurpose,
  caseId: string | undefined,
  requirementId: string | undefined,
  now: Date
) {
  if (principal.kind === "user") {
    if (purpose === "IMPORT_SOURCE" && !hasCapability(principal, "import:manage")) {
      throw new SourceError("FORBIDDEN", "You cannot start an import.", 403);
    }
    if (purpose === "EVIDENCE" && !hasCapability(principal, "case:resolve") && !hasCapability(principal, "evidence:read_private")) {
      throw new SourceError("FORBIDDEN", "You cannot upload evidence.", 403);
    }
    return;
  }
  if (principal.kind !== "supplier_portal") {
    throw new SourceError("FORBIDDEN", "You cannot perform this action.", 403);
  }
  if (purpose !== "EVIDENCE") {
    throw new SourceError("FORBIDDEN", "This portal grant cannot perform that action.", 403);
  }
  if (!principal.allowedCommands.includes("UPLOAD_EVIDENCE") && !principal.allowedCommands.includes("SUBMIT_RESPONSE")) {
    throw new SourceError("FORBIDDEN", "This portal grant cannot perform that action.", 403);
  }
  const grants = await store.listPortalGrantsForTenant(principal.organisationId);
  const grant = grants.find((row) => row.id === principal.grantId);
  if (!grant || grant.revokedAt || new Date(grant.expiresAt) <= now) {
    throw new SourceError("REVOKED", "This link is no longer valid.", 401);
  }
  if (!caseId || !principal.allowedCaseIds.includes(caseId)) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
  if (requirementId && !principal.allowedRequirementIds.includes(requirementId)) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
}

async function requireOwnedUpload(
  store: PersistencePort,
  principal: AnyPrincipal,
  uploadId: string,
  now: Date
): Promise<StorageObjectRecord> {
  const record = await store.getStorageObject(uploadId);
  if (!record || record.organisationId !== principal.organisationId || record.deletedAt) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
  if (record.expiresAt && new Date(record.expiresAt) <= now && record.availability !== "AVAILABLE") {
    throw new SourceError("EXPIRED", "This upload expired.", 400);
  }
  if (principal.kind === "supplier_portal") {
    if (record.createdViaPortalGrantId !== principal.grantId) {
      throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
    }
    if (record.caseId && !principal.allowedCaseIds.includes(record.caseId)) {
      throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
    }
  }
  return record;
}

async function quarantine(
  store: PersistencePort,
  storage: ObjectStorage,
  record: StorageObjectRecord,
  now: Date,
  reason: string
) {
  try {
    await storage.deleteTemporary(record.bucket, record.objectKey);
  } catch {
    // Best-effort. Index still marks the object rejected.
  }
  await store.saveStorageObject({
    ...record,
    availability: "REJECTED",
    scanStatus: "REJECTED",
    deletedAt: now.toISOString(),
  });
  metricInc(METRICS.storageRejected);
  logOperational("storage.evidence_rejected", { organisationId: record.organisationId, reason: "type_or_integrity" });
  await store.appendAudit({
    id: store.nextId("aud"),
    organisationId: record.organisationId,
    principalId: record.createdByPrincipalId,
    action: "EVIDENCE_UPLOAD_REJECTED",
    resourceType: "StorageObject",
    resourceId: record.id,
    result: "failure",
    reason,
    createdAt: now.toISOString(),
    policyVersion: "b2-v1",
  });
}

async function attachEvidenceRecord(
  store: PersistencePort,
  principal: AnyPrincipal,
  object: StorageObjectRecord,
  now: Date
): Promise<EvidenceRecord> {
  const state = (await store.loadEngine(object.organisationId)) ?? emptyState();
  if (object.supersedesStorageObjectId) {
    const previous = state.evidence.find((item) => item.storageObjectId === object.supersedesStorageObjectId);
    if (previous) {
      const replacement = buildEvidence(state, principal, object, now, previous.id);
      previous.supersededByEvidenceId = replacement.id;
      state.evidence.push(replacement);
      await persistEvidence(store, object, replacement, now);
      await store.saveEngine(object.organisationId, state);
      return replacement;
    }
  }
  const existing = state.evidence.find((item) => item.storageObjectId === object.id);
  if (existing) return existing;
  const evidence = buildEvidence(state, principal, object, now);
  state.evidence.push(evidence);
  await persistEvidence(store, object, evidence, now);
  await store.saveEngine(object.organisationId, state);
  return evidence;
}

function buildEvidence(
  state: EngineState,
  principal: AnyPrincipal,
  object: StorageObjectRecord,
  now: Date,
  supersedesEvidenceId?: string
): EvidenceRecord {
  state.seq += 1;
  const linkedCase = object.caseId ? state.cases.find((item) => item.id === object.caseId) : undefined;
  const requirement = object.requirementId
    ? state.requirements.find((item) => item.id === object.requirementId)
    : linkedCase
      ? state.requirements.find((item) => item.id === linkedCase.requirementId)
      : undefined;
  const ownerActorId = principal.kind === "supplier_portal" ? principal.actorId : principal.organisationId;
  const scope: EvidenceScope = requirement
    ? { kind: "product", id: requirement.subjectId, label: requirement.subjectLabel }
    : { kind: "product", label: object.originalFilename };
  return {
    id: `ev-${state.seq}`,
    filename: object.originalFilename,
    sha256: object.sha256 ?? "",
    issuer: state.actors.find((actor) => actor.id === ownerActorId)?.name ?? "Uploader",
    ownerActorId,
    validUntil: new Date(now.getTime() + 400 * 24 * 60 * 60 * 1000).toISOString(),
    expired: false,
    scope,
    visibility: "private",
    linkedClaimIds: [],
    storageObjectId: object.id,
    mimeType: object.mimeType,
    sizeBytes: object.sizeBytes,
    availability: "AVAILABLE",
    supersedesEvidenceId,
    uploadedViaPortalGrantId: object.createdViaPortalGrantId,
    uploadedByPrincipalId: object.createdByPrincipalId,
    createdAt: now.toISOString(),
  };
}

async function persistEvidence(
  store: PersistencePort,
  object: StorageObjectRecord,
  evidence: EvidenceRecord,
  now: Date
) {
  await store.putEvidence({
    evidenceId: evidence.id,
    ownerActorId: evidence.ownerActorId,
    organisationId: object.organisationId,
    storageKey: `${object.bucket}/${object.objectKey}`,
    storageObjectId: object.id,
    sha256: evidence.sha256,
    mimeType: evidence.mimeType ?? "application/octet-stream",
    size: evidence.sizeBytes ?? 0,
    originalFilename: evidence.filename,
    uploadedBy: evidence.uploadedByPrincipalId,
    createdAt: now.toISOString(),
    validUntil: evidence.validUntil,
    visibility: evidence.visibility,
    availability: evidence.availability,
    supersedesEvidenceId: evidence.supersedesEvidenceId,
    uploadedViaPortalGrantId: evidence.uploadedViaPortalGrantId,
  });
}

function storageError(error: unknown, message: string): SourceError {
  if (error instanceof SourceError) return error;
  if (error instanceof ObjectStorageError && error.code === "IMMUTABLE") {
    return new SourceError("CONFLICT", "Stored objects are immutable.", 409);
  }
  metricInc(METRICS.storageUploadFailures);
  return new SourceError("STORAGE_UNAVAILABLE", message, 503);
}

function safeEnv() {
  try {
    return getSourceEnvironment();
  } catch {
    return undefined;
  }
}
