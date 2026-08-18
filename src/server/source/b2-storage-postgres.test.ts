import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { applyMigrations } from "@/infrastructure/database/migrate";
import { PostgresPersistence } from "@/infrastructure/database/postgres";
import { requireDatabaseUrl, runtimeAppDatabaseUrl } from "@/infrastructure/database/seed-postgres";
import { createPostgresPool } from "@/infrastructure/database/pool";
import { emptyState } from "@/domain/source/engine";
import { createImportJob, runImportJob } from "@/server/source/import/service";
import { ROLE_CAPABILITIES } from "@/server/source/authorization";
import { resolveUserPrincipal } from "@/server/source/commands/dispatch";
import { createSharedMemoryObjectStorage } from "@/infrastructure/storage/memory";
import type { PersistencePort } from "@/infrastructure/database/ports";

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
