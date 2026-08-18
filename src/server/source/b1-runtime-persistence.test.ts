import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { applyMigrations } from "@/infrastructure/database/migrate";
import { PostgresPersistence } from "@/infrastructure/database/postgres";
import { requireDatabaseUrl, runtimeAppDatabaseUrl } from "@/infrastructure/database/seed-postgres";
import { createPostgresPool } from "@/infrastructure/database/pool";
import { emptyState } from "@/domain/source/engine";
import { createImportJob } from "@/server/source/import/service";
import { executeResolutionRun } from "@/server/source/resolution-run";
import { resolveUserPrincipal, dispatchCommand } from "@/server/source/commands/dispatch";
import { ROLE_CAPABILITIES } from "@/server/source/authorization";
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
  const orgId = `holzwerk-${suffix}`;
  const userId = `user-${orgId}`;
  await store.saveOrganisation({ id: orgId, name: "Holzwerk Schmidt GmbH", slug: orgId });
  await store.saveUser({
    id: userId,
    email: `owner@${orgId}.example`,
    displayName: "Schmidt",
  });
  await store.saveMembership({
    id: `mem-${orgId}`,
    userId,
    organisationId: orgId,
    role: "OWNER",
    capabilities: [...ROLE_CAPABILITIES.OWNER],
  });
  const empty = await store.loadEngine(orgId);
  expect(empty.pilotRuns).toHaveLength(0);
  expect(empty.requirements).toHaveLength(0);
  await store.saveEngine(orgId, emptyState({ id: orgId, name: "Holzwerk Schmidt GmbH" }));
  return resolveUserPrincipal(store, userId, orgId);
}

describe("B1 runtime persistence survival", () => {
  let migrator: Pool;
  let appUrl: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL && !process.env.CI && process.env.SOURCE_REQUIRE_POSTGRES !== "1") {
      throw new Error("Set DATABASE_URL or SOURCE_REQUIRE_POSTGRES=1 to run this file via npm run test:postgres");
    }
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

  it("reloads import, PilotRun, requirements, cases, events after a new PostgresPersistence instance", async () => {
    const firstPool = createPostgresPool(appUrl, "app");
    const first = new PostgresPersistence(firstPool);
    const principal = await provisionEmptyTenant(first, `restart-${Date.now()}`);
    await createImportJob(first, principal, manufacturerFiles(), NOW);
    await executeResolutionRun(first, principal, NOW);
    const before = await first.loadEngine(principal.organisationId);
    const jobsBefore = await first.listImportJobs(principal.organisationId);
    const jobEventsBefore = jobsBefore[0] ? await first.listImportEvents(jobsBefore[0].id) : [];
    const outboxBefore = await first.listOutbox("PENDING", principal.organisationId);
    expect(jobsBefore.length).toBeGreaterThan(0);
    expect(jobEventsBefore.length).toBeGreaterThan(0);
    expect(before.pilotRuns[0]?.baseline.missingRequirementIds.length).toBeGreaterThan(0);
    expect(before.requirements.length).toBeGreaterThan(0);
    expect(before.cases.length).toBeGreaterThan(0);
    expect(jobEventsBefore.length + before.events.length).toBeGreaterThan(0);
    expect(outboxBefore.length).toBeGreaterThan(0);
    await firstPool.end();

    const secondPool = createPostgresPool(appUrl, "app");
    const second = new PostgresPersistence(secondPool);
    const after = await second.loadEngine(principal.organisationId);
    const jobsAfter = await second.listImportJobs(principal.organisationId);
    const jobEventsAfter = jobsAfter[0] ? await second.listImportEvents(jobsAfter[0].id) : [];
    const outboxAfter = await second.listOutbox("PENDING", principal.organisationId);
    expect(jobsAfter.map((job) => job.id)).toEqual(jobsBefore.map((job) => job.id));
    expect(jobEventsAfter.map((event) => event.id)).toEqual(jobEventsBefore.map((event) => event.id));
    expect(after.pilotRuns[0]?.id).toBe(before.pilotRuns[0]?.id);
    expect(after.pilotRuns[0]?.baseline).toEqual(before.pilotRuns[0]?.baseline);
    expect(after.pilotRuns[0]?.baseline.missingRequirementIds).toEqual(
      before.pilotRuns[0]?.baseline.missingRequirementIds
    );
    expect(after.requirementOutcomes).toEqual(before.requirementOutcomes);
    expect(after.contactAvoidances).toEqual(before.contactAvoidances);
    expect(after.requirements.map((item) => item.id)).toEqual(before.requirements.map((item) => item.id));
    expect(after.cases.map((item) => item.id)).toEqual(before.cases.map((item) => item.id));
    expect(after.events).toEqual(before.events);
    expect(outboxAfter.map((row) => row.id).sort()).toEqual(outboxBefore.map((row) => row.id).sort());
    await secondPool.end();
  });

  it("keeps a committed command after a new PostgresPersistence instance", async () => {
    const firstPool = createPostgresPool(appUrl, "app");
    const first = new PostgresPersistence(firstPool);
    const principal = await provisionEmptyTenant(first, `cmd-${Date.now()}`);
    await createImportJob(first, principal, manufacturerFiles(), NOW);
    await executeResolutionRun(first, principal, NOW);
    const state = await first.loadEngine(principal.organisationId);
    const request = state.requests[0];
    if (!request) throw new Error("expected a supplier request after execute");
    const outcome = await dispatchCommand({
      store: first,
      principal,
      envelope: {
        commandId: `cmd-${principal.organisationId}`,
        idempotencyKey: `idem-${principal.organisationId}`,
        principalId: principal.userId,
        organisationId: principal.organisationId,
        issuedAt: NOW.toISOString(),
        command: { type: "SEND_REMINDER", caseId: request.caseId },
      },
      now: NOW,
    });
    expect(outcome.status).toBe("ok");
    await firstPool.end();

    const secondPool = createPostgresPool(appUrl, "app");
    const second = new PostgresPersistence(secondPool);
    const reloaded = await second.loadEngine(principal.organisationId);
    const sameRequest = reloaded.requests.find((item) => item.id === request.id);
    expect(sameRequest?.reminderCount).toBeGreaterThan(request.reminderCount);
    const processed = await second.findProcessedCommand(principal.organisationId, `idem-${principal.organisationId}`);
    expect(processed?.commandType).toBe("SEND_REMINDER");
    await secondPool.end();
  });

  it("returns ALREADY_PROCESSED for the same idempotency key after a new instance", async () => {
    const firstPool = createPostgresPool(appUrl, "app");
    const first = new PostgresPersistence(firstPool);
    const principal = await provisionEmptyTenant(first, `idem-${Date.now()}`);
    await createImportJob(first, principal, manufacturerFiles(), NOW);
    await executeResolutionRun(first, principal, NOW);
    const state = await first.loadEngine(principal.organisationId);
    const request = state.requests[0];
    if (!request) throw new Error("expected a supplier request after execute");
    const key = `idem-survive-${principal.organisationId}`;
    const firstResult = await dispatchCommand({
      store: first,
      principal,
      envelope: {
        commandId: `${key}-1`,
        idempotencyKey: key,
        principalId: principal.userId,
        organisationId: principal.organisationId,
        issuedAt: NOW.toISOString(),
        command: { type: "SEND_REMINDER", caseId: request.caseId },
      },
      now: NOW,
    });
    expect(firstResult.status).toBe("ok");
    await firstPool.end();

    const secondPool = createPostgresPool(appUrl, "app");
    const second = new PostgresPersistence(secondPool);
    const replay = await dispatchCommand({
      store: second,
      principal,
      envelope: {
        commandId: `${key}-2`,
        idempotencyKey: key,
        principalId: principal.userId,
        organisationId: principal.organisationId,
        issuedAt: NOW.toISOString(),
        command: { type: "SEND_REMINDER", caseId: request.caseId },
      },
      now: NOW,
    });
    expect(replay.status).toBe("ALREADY_PROCESSED");
    await secondPool.end();
  });

  it("keeps pending outbox after a new PostgresPersistence instance", async () => {
    const firstPool = createPostgresPool(appUrl, "app");
    const first = new PostgresPersistence(firstPool);
    const principal = await provisionEmptyTenant(first, `outbox-${Date.now()}`);
    await createImportJob(first, principal, manufacturerFiles(), NOW);
    await executeResolutionRun(first, principal, NOW);
    const pending = await first.listOutbox("PENDING", principal.organisationId);
    expect(pending.length).toBeGreaterThan(0);
    const ids = pending.map((row) => row.id).sort();
    await firstPool.end();

    const secondPool = createPostgresPool(appUrl, "app");
    const second = new PostgresPersistence(secondPool);
    const stillPending = await second.listOutbox("PENDING", principal.organisationId);
    expect(stillPending.map((row) => row.id).sort()).toEqual(ids);
    expect(stillPending.every((row) => row.status === "PENDING")).toBe(true);
    await secondPool.end();
  });

  it("runs health checks as source_app against required schema", async () => {
    const { checkPostgresHealth } = await import("@/infrastructure/database/health");
    const pool = createPostgresPool(appUrl, "app");
    const health = await checkPostgresHealth(pool);
    expect(health).toEqual({ database: "ok", persistence: "postgres" });
    const { rows } = await pool.query("SELECT current_user AS u");
    expect(rows[0].u).toBe("source_app");
    await pool.end();
  });

  it("isolates tenant B from tenant A after restart", async () => {
    const pool = createPostgresPool(appUrl, "app");
    const store = new PostgresPersistence(pool);
    const a = await provisionEmptyTenant(store, `iso-a-${Date.now()}`);
    const b = await provisionEmptyTenant(store, `iso-b-${Date.now()}`);
    await createImportJob(store, a, manufacturerFiles(), NOW);
    await pool.end();

    const restarted = createPostgresPool(appUrl, "app");
    const second = new PostgresPersistence(restarted);
    const fromB = await second.loadEngine(b.organisationId);
    expect(fromB.requirements).toHaveLength(0);
    const client = await restarted.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('source.organisation_id', $1, true)", [b.organisationId]);
      const leaked = await client.query("SELECT organisation_id FROM engine_states WHERE organisation_id = $1", [
        a.organisationId,
      ]);
      expect(leaked.rowCount).toBe(0);
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    await restarted.end();
  });
});
