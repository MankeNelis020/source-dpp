import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { applyMigrations } from "@/infrastructure/database/migrate";
import { PostgresPersistence } from "@/infrastructure/database/postgres";
import { requireDatabaseUrl, runtimeAppDatabaseUrl } from "@/infrastructure/database/seed-postgres";
import { createPostgresPool } from "@/infrastructure/database/pool";
import { emptyState } from "@/domain/source/engine";
import { createImportJob, createImportJobFromStorage, runImportJob } from "@/server/source/import/service";
import { createUploadIntent, putUploadBytes, finalizeUpload } from "@/server/source/uploads";
import { ROLE_CAPABILITIES } from "@/server/source/authorization";
import { resolveUserPrincipal } from "@/server/source/commands/dispatch";
import { createSharedMemoryObjectStorage } from "@/infrastructure/storage/memory";
import { TimestampEncodingError } from "@/infrastructure/database/timestamps";
import type { PersistencePort, StorageObjectRecord } from "@/infrastructure/database/ports";

const NOW = new Date("2026-08-18T10:00:00.000Z");
const FIXTURES = join(process.cwd(), "fixtures/p1-manufacturer");

function manufacturerFiles() {
  return {
    products: readFileSync(join(FIXTURES, "artikelstamm.csv"), "utf8"),
    suppliers: readFileSync(join(FIXTURES, "lieferanten.csv"), "utf8"),
    bom: readFileSync(join(FIXTURES, "stueckliste.csv"), "utf8"),
    materials: readFileSync(join(FIXTURES, "materialien.csv"), "utf8"),
  };
}

async function provisionEmptyTenant(store: PersistencePort, suffix: string) {
  const orgId = `holzwerk-b2-${suffix}`;
  const userId = `user-${orgId}`;
  await store.saveOrganisation({ id: orgId, name: "Holzwerk Schmidt GmbH", slug: orgId });
  await store.saveUser({ id: userId, email: `owner@${orgId}.example`, displayName: "Schmidt" });
  await store.saveMembership({
    id: `mem-${orgId}`,
    userId,
    organisationId: orgId,
    role: "OWNER",
    capabilities: [...ROLE_CAPABILITIES.OWNER],
  });
  await store.saveEngine(orgId, emptyState({ id: orgId, name: "Holzwerk Schmidt GmbH" }));
  return resolveUserPrincipal(store, userId, orgId);
}

describe("B2 postgres import source survival", () => {
  let migrator: Pool;
  let appUrl: string;

  beforeAll(async () => {
    const url = requireDatabaseUrl();
    if (!url) {
      throw new Error("DATABASE_URL is required for Postgres integration tests. Refusing to skip isolation tests.");
    }
    migrator = createPostgresPool(url, "migrator");
    await applyMigrations(migrator);
    appUrl = runtimeAppDatabaseUrl(url);
  });

  afterAll(async () => {
    await migrator?.end();
  });

  it("reloads ImportJob source object ids and bytes after a new PostgresPersistence instance", async () => {
    const map = new Map();
    const storage = createSharedMemoryObjectStorage(map);
    const firstPool = createPostgresPool(appUrl, "app");
    const first = new PostgresPersistence(firstPool);
    const principal = await provisionEmptyTenant(first, `${Date.now()}`);
    const job = await createImportJob(first, principal, manufacturerFiles(), NOW, { objectStorage: storage });
    expect(job.sourceStorageObjectIds?.products).toBeTruthy();
    await firstPool.end();

    const secondPool = createPostgresPool(appUrl, "app");
    const second = new PostgresPersistence(secondPool);
    const reloaded = await second.getImportJob(job.id);
    expect(reloaded?.sourceStorageObjectIds?.products).toBe(job.sourceStorageObjectIds?.products);
    const object = await second.getStorageObject(reloaded!.sourceStorageObjectIds!.products!);
    expect(object?.organisationId).toBe(principal.organisationId);
    const restartedStorage = createSharedMemoryObjectStorage(map);
    const processed = await runImportJob(second, principal, job.id, undefined, NOW, { objectStorage: restartedStorage });
    expect(processed.sourceStorageObjectIds?.products).toBe(job.sourceStorageObjectIds?.products);
    const bytes = await restartedStorage.get(object!.bucket, object!.objectKey);
    expect(bytes?.sha256).toBe(object?.sha256);
    await secondPool.end();
  });
});

const CREATED = "2026-08-19T04:27:19.000Z";
const EXPIRES = "2026-08-20T04:27:19.000Z";
const FINALIZED = "2026-08-19T05:00:00.000Z";
const DELETED = "2026-08-21T04:27:19.000Z";
const JS_DATE_STRING = "Wed Aug 19 2026 04:27:19 GMT+0000 (Coordinated Universal Time)";

function storageFixture(orgId: string, extra: Partial<StorageObjectRecord> = {}): StorageObjectRecord {
  return {
    id: `so-ts-${orgId}`,
    organisationId: orgId,
    bucket: "source-imports",
    objectKey: `t/${orgId}`,
    purpose: "TEMPORARY_UPLOAD",
    availability: "UPLOADING",
    originalFilename: "artikelstamm.csv",
    mimeType: "text/csv",
    scanStatus: "PENDING",
    createdAt: CREATED,
    ...extra,
  };
}

describe("B2 storage_objects timestamptz encoding", () => {
  let migrator: Pool;
  let appUrl: string;

  beforeAll(async () => {
    const url = requireDatabaseUrl();
    if (!url) {
      throw new Error("DATABASE_URL is required for Postgres integration tests. Refusing to skip isolation tests.");
    }
    migrator = createPostgresPool(url, "migrator");
    await applyMigrations(migrator);
    appUrl = runtimeAppDatabaseUrl(url);
  });

  afterAll(async () => {
    await migrator?.end();
  });

  it("persists Date and ISO timestamps as timestamptz without SQLSTATE 22007", async () => {
    const pool = createPostgresPool(appUrl, "app");
    const store = new PostgresPersistence(pool);
    const principal = await provisionEmptyTenant(store, `ts-${Date.now()}`);
    const record = storageFixture(principal.organisationId, {
      createdAt: new Date(CREATED) as unknown as string,
      expiresAt: new Date(EXPIRES) as unknown as string,
      finalizedAt: new Date(FINALIZED) as unknown as string,
    });
    await store.saveStorageObject(record);
    const loaded = await store.getStorageObject(record.id);
    expect(loaded?.createdAt).toBe(CREATED);
    expect(loaded?.expiresAt).toBe(EXPIRES);
    expect(loaded?.finalizedAt).toBe(FINALIZED);
    expect(loaded?.deletedAt).toBeUndefined();
    await store.saveStorageObject({
      ...loaded!,
      deletedAt: new Date(DELETED) as unknown as string,
    });
    expect(await store.getStorageObject(record.id)).toBeUndefined();
    const { rows } = await migrator.query<{
      created_at: Date;
      expires_at: Date;
      finalized_at: Date;
      deleted_at: Date;
      created_at_text: string;
    }>(
      `SELECT created_at, expires_at, finalized_at, deleted_at, created_at::text AS created_at_text
       FROM storage_objects WHERE id = $1`,
      [record.id]
    );
    expect(rows[0]?.created_at.toISOString()).toBe(CREATED);
    expect(rows[0]?.expires_at.toISOString()).toBe(EXPIRES);
    expect(rows[0]?.finalized_at.toISOString()).toBe(FINALIZED);
    expect(rows[0]?.deleted_at.toISOString()).toBe(DELETED);
    expect(rows[0]?.created_at_text).not.toMatch(/Wed Aug|Coordinated Universal Time/);
    expect(rows[0]?.created_at_text).toMatch(/2026-08-19/);
    await pool.end();
  });

  it("keeps ISO-string createdAt unchanged through save and load", async () => {
    const pool = createPostgresPool(appUrl, "app");
    const store = new PostgresPersistence(pool);
    const principal = await provisionEmptyTenant(store, `iso-${Date.now()}`);
    const record = storageFixture(principal.organisationId, {
      id: `so-iso-${principal.organisationId}`,
      objectKey: `t/iso-${principal.organisationId}`,
      createdAt: CREATED,
      expiresAt: EXPIRES,
    });
    await store.saveStorageObject(record);
    const loaded = await store.getStorageObject(record.id);
    expect(loaded?.createdAt).toBe(CREATED);
    expect(loaded?.expiresAt).toBe(EXPIRES);
    expect(loaded?.createdAt).not.toMatch(/Wed Aug/);
    await pool.end();
  });

  it("rejects malformed createdAt instead of sending Date.toString() to Postgres", async () => {
    const pool = createPostgresPool(appUrl, "app");
    const store = new PostgresPersistence(pool);
    const principal = await provisionEmptyTenant(store, `bad-${Date.now()}`);
    await expect(
      store.saveStorageObject(
        storageFixture(principal.organisationId, {
          id: `so-bad-${principal.organisationId}`,
          objectKey: `t/bad-${principal.organisationId}`,
          createdAt: JS_DATE_STRING,
        })
      )
    ).rejects.toBeInstanceOf(TimestampEncodingError);
    await pool.end();
  });

  it("completes upload intent then bytes without SQLSTATE 22007 and imports products", async () => {
    const map = new Map();
    const storage = createSharedMemoryObjectStorage(map);
    const pool = createPostgresPool(appUrl, "app");
    const store = new PostgresPersistence(pool);
    const principal = await provisionEmptyTenant(store, `up-${Date.now()}`);
    const csv = Buffer.from(manufacturerFiles().products, "utf8");
    const intent = await createUploadIntent({
      store,
      principal,
      input: { purpose: "IMPORT_SOURCE", filenameHint: "artikelstamm.csv", mimeHint: "text/csv" },
      now: NOW,
    });
    const afterBytes = await putUploadBytes({
      store,
      principal,
      uploadId: intent.id,
      bytes: csv,
      filenameHint: "artikelstamm.csv",
      objectStorage: storage,
      now: NOW,
    });
    expect(afterBytes.availability).toBe("PROCESSING");
    expect(afterBytes.createdAt).toBe(NOW.toISOString());
    expect(afterBytes.createdAt).not.toMatch(/Wed Aug|Coordinated Universal Time/);
    const finalized = await finalizeUpload({
      store,
      principal,
      uploadId: intent.id,
      objectStorage: storage,
      now: NOW,
    });
    expect(finalized.finalizedAt).toBe(NOW.toISOString());
    expect(finalized.expiresAt).toBeUndefined();
    const job = await createImportJobFromStorage(
      store,
      principal,
      { products: finalized.id },
      NOW,
      { objectStorage: storage }
    );
    expect(job.state === "COMPLETE" || job.state === "PARTIAL" || job.state === "UPLOADED").toBe(true);
    const engine = await store.loadEngine(principal.organisationId);
    expect(engine.subjects.filter((row) => row.kind === "PRODUCT").length).toBeGreaterThan(0);
    await pool.end();
  });
});

