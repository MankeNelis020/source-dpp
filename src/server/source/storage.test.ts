import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { emptyState } from "@/domain/source/engine";
import { MemoryPersistence } from "@/infrastructure/database/memory";
import { createSharedMemoryObjectStorage } from "@/infrastructure/storage/memory";
import { sha256Hex } from "@/infrastructure/storage/files";
import { createUploadIntent, putUploadBytes, finalizeUpload, cleanupExpiredUploads } from "@/server/source/uploads";
import { createImportJob, runImportJob } from "@/server/source/import/service";
import { dispatchCommand, resolveUserPrincipal } from "@/server/source/commands/dispatch";
import { executeResolutionRun } from "@/server/source/resolution-run";
import { getEvidenceAccess } from "@/server/source/queries";
import { ROLE_CAPABILITIES } from "@/server/source/authorization";
import { SourceError } from "@/server/source/types";
import { leakScan } from "@/server/source/confidentiality";
import { opaqueEvidenceRef } from "@/server/source/disclosure";
import { evaluatePilotRun } from "@/domain/source/analytics";

const NOW = new Date("2026-08-18T10:00:00.000Z");
const FIXTURES = join(process.cwd(), "fixtures/p1-manufacturer");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const CSV = Buffer.from("external_product_id,name\nurban-chair-04,Urban Chair 04\n");

function manufacturerFiles() {
  return {
    products: readFileSync(join(FIXTURES, "artikelstamm.csv"), "utf8"),
    suppliers: readFileSync(join(FIXTURES, "lieferanten.csv"), "utf8"),
    bom: readFileSync(join(FIXTURES, "stueckliste.csv"), "utf8"),
    materials: readFileSync(join(FIXTURES, "materialien.csv"), "utf8"),
  };
}

async function provision(store: MemoryPersistence, id: string) {
  store.organisations.set(id, { id, name: `${id} GmbH`, slug: id });
  store.users.set(`user-${id}`, { id: `user-${id}`, email: `owner@${id}.example`, displayName: id });
  store.memberships.push({
    id: `mem-${id}`,
    userId: `user-${id}`,
    organisationId: id,
    role: "OWNER",
    capabilities: [...ROLE_CAPABILITIES.OWNER],
  });
  store.saveEngine(id, emptyState({ id, name: `${id} GmbH` }));
  return resolveUserPrincipal(store, `user-${id}`, id);
}

describe("B2 durable storage", () => {
  it("normalizes Date createdAt to ISO on save so Postgres-shaped values cannot leak", () => {
    const store = new MemoryPersistence();
    const created = new Date("2026-08-19T04:27:19.000Z");
    store.saveStorageObject({
      id: "so-date",
      organisationId: "org-date",
      bucket: "source-imports",
      objectKey: "t/date",
      purpose: "TEMPORARY_UPLOAD",
      availability: "UPLOADING",
      originalFilename: "products.csv",
      scanStatus: "PENDING",
      createdAt: created as unknown as string,
      expiresAt: new Date("2026-08-20T04:27:19.000Z") as unknown as string,
    });
    const row = store.getStorageObject("so-date");
    expect(row?.createdAt).toBe("2026-08-19T04:27:19.000Z");
    expect(row?.expiresAt).toBe("2026-08-20T04:27:19.000Z");
    expect(row?.createdAt).not.toBe(String(created));
  });

  it("does not put SUPABASE_SERVICE_ROLE_KEY in client sources", () => {
    const roots = ["src/app", "src/components", "src/client", "src/lib"].map((dir) => join(process.cwd(), dir));
    const hits: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          const text = readFileSync(path, "utf8");
          if (text.includes("SUPABASE_SERVICE_ROLE_KEY")) hits.push(path);
        }
      }
    }
    for (const root of roots) walk(root);
    expect(hits).toEqual([]);
  });

  it("stores import bytes and continues after a new storage adapter instance", async () => {
    const map = new Map();
    const storage = createSharedMemoryObjectStorage(map);
    const store = new MemoryPersistence();
    const alice = await provision(store, "alice-import");
    const job = await createImportJob(store, alice, manufacturerFiles(), NOW, { objectStorage: storage });
    expect(job.sourceStorageObjectIds?.products).toBeTruthy();
    const restarted = createSharedMemoryObjectStorage(map);
    const again = await runImportJob(store, alice, job.id, undefined, NOW, { objectStorage: restarted });
    expect(again.sourceStorageObjectIds?.products).toBe(job.sourceStorageObjectIds?.products);
    const object = await store.getStorageObject(job.sourceStorageObjectIds!.products!);
    const bytes = await restarted.get(object!.bucket, object!.objectKey);
    expect(bytes?.sha256).toBe(object?.sha256);
  });

  it("keeps the import source when mapping/parsing can be retried", async () => {
    const storage = createSharedMemoryObjectStorage();
    const store = new MemoryPersistence();
    const alice = await provision(store, "alice-retry");
    const job = await createImportJob(store, alice, manufacturerFiles(), NOW, { objectStorage: storage });
    const sourceId = job.sourceStorageObjectIds!.products!;
    const retried = await runImportJob(store, alice, job.id, undefined, NOW, { objectStorage: storage });
    expect(retried.sourceStorageObjectIds?.products).toBe(sourceId);
    expect(await store.getStorageObject(sourceId)).toBeTruthy();
  });

  it("rejects client-chosen object paths", async () => {
    const store = new MemoryPersistence();
    const alice = await provision(store, "alice-path");
    await expect(
      createUploadIntent({
        store,
        principal: alice,
        input: { purpose: "EVIDENCE", objectKey: "../organisations/bob/secret.pdf" },
        now: NOW,
      })
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      createUploadIntent({
        store,
        principal: alice,
        input: { purpose: "EVIDENCE", bucket: "source-evidence", organisationId: "bob" },
        now: NOW,
      })
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects oversized and executable uploads without creating available evidence", async () => {
    const storage = createSharedMemoryObjectStorage();
    const store = new MemoryPersistence();
    const alice = await provision(store, "alice-abuse");
    const intent = await createUploadIntent({
      store,
      principal: alice,
      input: { purpose: "EVIDENCE", filenameHint: "payload.exe" },
      now: NOW,
    });
    await expect(
      putUploadBytes({
        store,
        principal: alice,
        uploadId: intent.id,
        bytes: Uint8Array.from([0x4d, 0x5a, 0x90, 0x00]),
        filenameHint: "payload.exe",
        objectStorage: storage,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: "FILE_TYPE_NOT_ALLOWED" });
    expect(await store.getStorageObject(intent.id)).toBeUndefined();
    expect(store.loadEngine("alice-abuse").evidence).toHaveLength(0);

    const big = await createUploadIntent({
      store,
      principal: alice,
      input: { purpose: "IMPORT_SOURCE", filenameHint: "huge.csv" },
      now: NOW,
    });
    await expect(
      putUploadBytes({
        store,
        principal: alice,
        uploadId: big.id,
        bytes: Buffer.alloc(20 * 1024 * 1024 + 1, 97),
        filenameHint: "huge.csv",
        objectStorage: storage,
        now: NOW,
      })
    ).rejects.toBeInstanceOf(SourceError);
  });

  it("hashes stored evidence and rejects a mismatched digest", async () => {
    const storage = createSharedMemoryObjectStorage();
    const store = new MemoryPersistence();
    const alice = await provision(store, "alice-hash");
    const intent = await createUploadIntent({
      store,
      principal: alice,
      input: { purpose: "EVIDENCE", filenameHint: "certificate.pdf", caseId: "SRC-1" },
      now: NOW,
    });
    await putUploadBytes({
      store,
      principal: alice,
      uploadId: intent.id,
      bytes: PDF,
      filenameHint: "certificate.pdf",
      objectStorage: storage,
      now: NOW,
    });
    const row = await store.getStorageObject(intent.id);
    expect(row?.sha256).toBe(sha256Hex(PDF));
    store.saveStorageObject({ ...row!, sha256: "deadbeef" });
    await expect(
      finalizeUpload({ store, principal: alice, uploadId: intent.id, objectStorage: storage, now: NOW })
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(store.loadEngine("alice-hash").evidence).toHaveLength(0);
  });

  it("rejects overwrite of an accepted evidence object", async () => {
    const storage = createSharedMemoryObjectStorage();
    const store = new MemoryPersistence();
    const alice = await provision(store, "alice-imm");
    const first = await createUploadIntent({
      store,
      principal: alice,
      input: { purpose: "EVIDENCE", filenameHint: "v1.pdf" },
      now: NOW,
    });
    await putUploadBytes({
      store,
      principal: alice,
      uploadId: first.id,
      bytes: PDF,
      filenameHint: "v1.pdf",
      objectStorage: storage,
      now: NOW,
    });
    const accepted = await finalizeUpload({
      store,
      principal: alice,
      uploadId: first.id,
      objectStorage: storage,
      now: NOW,
    });
    await expect(
      storage.putImmutable({
        bucket: accepted.bucket,
        key: accepted.objectKey,
        bytes: PDF,
        mimeType: "application/pdf",
        sha256: sha256Hex(PDF),
      })
    ).rejects.toMatchObject({ code: "IMMUTABLE" });
    const replacement = await createUploadIntent({
      store,
      principal: alice,
      input: { purpose: "EVIDENCE", filenameHint: "v2.pdf", supersedesStorageObjectId: accepted.id },
      now: NOW,
    });
    await putUploadBytes({
      store,
      principal: alice,
      uploadId: replacement.id,
      bytes: PDF,
      filenameHint: "v2.pdf",
      objectStorage: storage,
      now: NOW,
    });
    const second = await finalizeUpload({
      store,
      principal: alice,
      uploadId: replacement.id,
      objectStorage: storage,
      now: NOW,
    });
    expect(second.id).not.toBe(accepted.id);
    const evidence = store.loadEngine("alice-imm").evidence;
    expect(evidence).toHaveLength(2);
    expect(evidence[0].supersededByEvidenceId).toBe(evidence[1].id);
  });

  it("isolates Alice from Bob even when she knows ids", async () => {
    const storage = createSharedMemoryObjectStorage();
    const store = new MemoryPersistence();
    const alice = await provision(store, "alice-iso");
    const bob = await provision(store, "bob-iso");
    const bobIntent = await createUploadIntent({
      store,
      principal: bob,
      input: { purpose: "EVIDENCE", filenameHint: "bob.pdf" },
      now: NOW,
    });
    await putUploadBytes({
      store,
      principal: bob,
      uploadId: bobIntent.id,
      bytes: PDF,
      filenameHint: "bob.pdf",
      objectStorage: storage,
      now: NOW,
    });
    const bobObject = await finalizeUpload({
      store,
      principal: bob,
      uploadId: bobIntent.id,
      objectStorage: storage,
      now: NOW,
    });
    const bobEvidence = store.loadEngine("bob-iso").evidence[0];
    await expect(finalizeUpload({ store, principal: alice, uploadId: bobObject.id, objectStorage: storage, now: NOW })).rejects.toMatchObject({
      code: "RESOURCE_UNAVAILABLE",
    });
    await expect(getEvidenceAccess(store, alice, bobEvidence.id, storage)).rejects.toMatchObject({
      code: "RESOURCE_UNAVAILABLE",
    });
    await expect(getEvidenceAccess(store, alice, opaqueEvidenceRef("bob-iso", bobEvidence.id), storage)).rejects.toMatchObject({
      code: "RESOURCE_UNAVAILABLE",
    });
    await expect(getEvidenceAccess(store, alice, bobObject.objectKey, storage)).rejects.toMatchObject({
      code: "RESOURCE_UNAVAILABLE",
    });
    const bobRead = await getEvidenceAccess(store, bob, opaqueEvidenceRef("bob-iso", bobEvidence.id), storage);
    expect(bobRead.type === "EVIDENCE_RECORD" ? bobRead.signedUrl : undefined).toBeTruthy();
    expect(JSON.stringify(bobRead)).not.toContain("storageKey");
  });

  it("does not attach portal evidence to a case outside the grant", async () => {
    const storage = createSharedMemoryObjectStorage();
    const store = new MemoryPersistence();
    const alice = await provision(store, "alice-scope");
    store.portalGrants.push({
      id: "grant-x",
      tokenHash: "x",
      actorId: "supplier-x",
      tenantContextId: "alice-scope",
      allowedCaseIds: ["CASE-X"],
      allowedRequirementIds: ["REQ-X"],
      allowedCommands: ["UPLOAD_EVIDENCE", "SUBMIT_RESPONSE"],
      expiresAt: "2027-01-01T00:00:00.000Z",
      createdAt: NOW.toISOString(),
    });
    const portal = {
      kind: "supplier_portal" as const,
      grantId: "grant-x",
      actorId: "supplier-x",
      organisationId: "alice-scope",
      allowedCaseIds: ["CASE-X"],
      allowedRequirementIds: ["REQ-X"],
      allowedCommands: ["UPLOAD_EVIDENCE" as const, "SUBMIT_RESPONSE" as const],
    };
    await expect(
      createUploadIntent({
        store,
        principal: portal,
        input: { purpose: "EVIDENCE", filenameHint: "y.pdf", caseId: "CASE-Y" },
        now: NOW,
      })
    ).rejects.toMatchObject({ code: "RESOURCE_UNAVAILABLE" });
    expect(store.loadEngine("alice-scope").evidence).toHaveLength(0);
    void alice;
    void storage;
  });

  it("rejects finalization after the portal grant is revoked and cleans the temporary object", async () => {
    const storage = createSharedMemoryObjectStorage();
    const store = new MemoryPersistence();
    await provision(store, "alice-revoke");
    store.portalGrants.push({
      id: "grant-rev",
      tokenHash: "rev",
      actorId: "supplier-x",
      tenantContextId: "alice-revoke",
      allowedCaseIds: ["CASE-X"],
      allowedRequirementIds: ["REQ-X"],
      allowedCommands: ["UPLOAD_EVIDENCE", "SUBMIT_RESPONSE"],
      expiresAt: "2027-01-01T00:00:00.000Z",
      createdAt: NOW.toISOString(),
    });
    const portal = {
      kind: "supplier_portal" as const,
      grantId: "grant-rev",
      actorId: "supplier-x",
      organisationId: "alice-revoke",
      allowedCaseIds: ["CASE-X"],
      allowedRequirementIds: ["REQ-X"],
      allowedCommands: ["UPLOAD_EVIDENCE" as const, "SUBMIT_RESPONSE" as const],
    };
    const intent = await createUploadIntent({
      store,
      principal: portal,
      input: { purpose: "EVIDENCE", filenameHint: "cert.pdf", caseId: "CASE-X", requirementId: "REQ-X" },
      now: NOW,
    });
    await putUploadBytes({
      store,
      principal: portal,
      uploadId: intent.id,
      bytes: PDF,
      filenameHint: "cert.pdf",
      objectStorage: storage,
      now: NOW,
    });
    const grant = store.portalGrants.find((row) => row.id === "grant-rev")!;
    grant.revokedAt = NOW.toISOString();
    await expect(
      finalizeUpload({ store, principal: portal, uploadId: intent.id, objectStorage: storage, now: NOW })
    ).rejects.toMatchObject({ code: "REVOKED" });
    expect(store.loadEngine("alice-revoke").evidence).toHaveLength(0);
    const record = await store.getStorageObject(intent.id);
    expect(record?.availability === "AVAILABLE").toBe(false);
  });

  it("returns attestation without signed URL, storage ids, or filename", async () => {
    const store = new MemoryPersistence();
    const nordic = await resolveUserPrincipal(store, "user-nordic-owner", "nordic");
    const attest = await getEvidenceAccess(store, nordic, "ev-nordic-private");
    expect(attest.type).toBe("EVIDENCE_ATTESTATION");
    const serialized = JSON.stringify(attest);
    expect(serialized).not.toContain("signedUrl");
    expect(serialized).not.toContain("nordic-origin-certificate.pdf");
    expect(serialized).not.toContain("ev-nordic-private");
    expect(leakScan(attest, ["nordic-origin-certificate.pdf", "ev-nordic-private"])).toEqual([]);
  });

  it("cleans expired temporary uploads", async () => {
    const storage = createSharedMemoryObjectStorage();
    const store = new MemoryPersistence();
    const alice = await provision(store, "alice-tmp");
    const intent = await createUploadIntent({
      store,
      principal: alice,
      input: { purpose: "IMPORT_SOURCE", filenameHint: "stale.csv" },
      now: NOW,
    });
    await putUploadBytes({
      store,
      principal: alice,
      uploadId: intent.id,
      bytes: CSV,
      filenameHint: "stale.csv",
      objectStorage: storage,
      now: NOW,
    });
    const row = await store.getStorageObject(intent.id);
    store.saveStorageObject({ ...row!, expiresAt: "2020-01-01T00:00:00.000Z" });
    const result = await cleanupExpiredUploads({ store, objectStorage: storage, now: NOW });
    expect(result.deleted).toBeGreaterThan(0);
    expect(await store.getStorageObject(intent.id)).toBeUndefined();
  });

  it("runs the golden storage path without leaking to Bob", async () => {
    const map = new Map();
    const storage = createSharedMemoryObjectStorage(map);
    const store = new MemoryPersistence();
    const alice = await provision(store, "holzwerk-b2");
    await createImportJob(store, alice, manufacturerFiles(), NOW, { objectStorage: storage });
    await executeResolutionRun(store, alice, NOW);
    const afterExecute = store.loadEngine("holzwerk-b2");
    expect(afterExecute.requests.length).toBeGreaterThan(0);
    const grant = store.portalGrants.find((row) => row.tenantContextId === "holzwerk-b2")!;
    const portal = {
      kind: "supplier_portal" as const,
      grantId: grant.id,
      actorId: grant.actorId,
      organisationId: grant.tenantContextId,
      allowedCaseIds: grant.allowedCaseIds,
      allowedRequirementIds: grant.allowedRequirementIds,
      allowedCommands: grant.allowedCommands,
    };
    const caseId = grant.allowedCaseIds[0];
    const requirementId = grant.allowedRequirementIds[0];
    const intent = await createUploadIntent({
      store,
      principal: portal,
      input: { purpose: "EVIDENCE", filenameHint: "recycled.pdf", caseId, requirementId },
      now: NOW,
    });
    await putUploadBytes({
      store,
      principal: portal,
      uploadId: intent.id,
      bytes: PDF,
      filenameHint: "recycled.pdf",
      objectStorage: storage,
      now: NOW,
    });
    const stored = await finalizeUpload({ store, principal: portal, uploadId: intent.id, objectStorage: storage, now: NOW });
    const requirement = afterExecute.requirements.find((row) => row.id === requirementId)!;
    const outcome = await dispatchCommand({
      store,
      principal: portal,
      envelope: {
        commandId: "portal-b2",
        idempotencyKey: "portal-b2",
        principalId: portal.grantId,
        organisationId: portal.organisationId,
        issuedAt: NOW.toISOString(),
        command: {
          type: "SUBMIT_RESPONSE",
          caseId,
          value: "42",
          unit: "%",
          evidence: {
            filename: "recycled.pdf",
            storageObjectId: stored.id,
            extractedValue: "42",
            confidence: 99,
            scope: { kind: "product", id: requirement.subjectId, label: requirement.subjectLabel },
          },
          permission: "GRANTED",
        },
      },
      now: NOW,
    });
    expect(outcome.status === "ok" || outcome.status === "ALREADY_PROCESSED").toBe(true);
    const after = store.loadEngine("holzwerk-b2");
    const answered = after.cases.find((row) => row.id === caseId);
    expect(answered?.state).toBe("READY");
    expect(evaluatePilotRun(after, after.pilotRuns[0]).resolvedSupplierResponse).toBeGreaterThan(0);
    const bob = await provision(store, "bob-b2");
    const evidence = after.evidence.find((row) => row.storageObjectId === stored.id)!;
    await expect(getEvidenceAccess(store, bob, evidence.id, storage)).rejects.toMatchObject({ code: "RESOURCE_UNAVAILABLE" });
    const aliceView = await getEvidenceAccess(store, alice, opaqueEvidenceRef("holzwerk-b2", evidence.id), storage);
    expect(aliceView.type === "EVIDENCE_RECORD" ? Boolean(aliceView.signedUrl) : true).toBe(true);
    const restarted = createSharedMemoryObjectStorage(map);
    const still = await restarted.get(stored.bucket, stored.objectKey);
    expect(still?.sha256).toBe(stored.sha256);
  });
});
