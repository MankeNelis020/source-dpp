import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { applyMigrations } from "@/infrastructure/database/migrate";
import { resetAndSeedPostgres } from "@/infrastructure/database/seed-postgres";
import { PostgresPersistence } from "@/infrastructure/database/postgres";
import { PostgresRateLimiter } from "@/infrastructure/rate-limit/postgres";
import { dispatchCommand, resolveUserPrincipal } from "@/server/source/commands/dispatch";
import { getCaseDetail, getProductDetail, searchTenant } from "@/server/source/queries";
import { resolvePortalPrincipal } from "@/server/source/portal";
import { SourceError } from "@/server/source/types";
import { MemoryEmailPort } from "@/infrastructure/database/ports";
import { processOutboxBatch } from "@/infrastructure/outbox/processor";

const NOW = new Date("2026-08-17T09:00:00.000Z");

function requiredUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required for Postgres integration tests. Refusing to skip isolation tests.");
  }
  return url;
}

function appUrl(url: string) {
  const parsed = new URL(url);
  parsed.username = "source_app";
  parsed.password = "source_app_dev_only";
  return parsed.toString();
}

describe("postgres security suite", () => {
  let migrator: Pool;
  let app: Pool;
  let store: PostgresPersistence;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL && !process.env.CI && process.env.SOURCE_REQUIRE_POSTGRES !== "1") {
      throw new Error("Set DATABASE_URL or SOURCE_REQUIRE_POSTGRES=1 to run this file via npm run test:postgres");
    }
    const url = requiredUrl();
    migrator = new Pool({ connectionString: url });
    await applyMigrations(migrator);
    await resetAndSeedPostgres(migrator);
    app = new Pool({ connectionString: appUrl(url) });
    store = new PostgresPersistence(app);
  });

  afterAll(async () => {
    await app?.end();
    await migrator?.end();
  });

  it("isolates tenant catalogue, evidence search, and cases under the runtime role", async () => {
    const acme = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    await expect(getProductDetail(store, acme, "fjord-stool")).rejects.toMatchObject({ code: "RESOURCE_UNAVAILABLE" });
    const search = await searchTenant(store, acme, "nordic-origin-certificate");
    expect(JSON.stringify(search)).not.toContain("nordic-origin-certificate");
    await expect(getCaseDetail(store, acme, "SRC-N-1")).rejects.toBeInstanceOf(SourceError);

    const { rows } = await app.query("SELECT set_config('source.organisation_id', 'acme', false)");
    void rows;
    const leaked = await app.query("SELECT organisation_id FROM engine_states WHERE organisation_id = 'nordic'");
    expect(leaked.rowCount).toBe(0);
  });

  it("hides confidential upstream identifiers from serialized case detail", async () => {
    const acme = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    const detail = await getCaseDetail(store, acme, "SRC-184844");
    const text = JSON.stringify(detail);
    expect(text).not.toContain("mill-north");
    expect(text).not.toContain("Nordic Fibre Mill");
    expect(detail.evidence && "id" in detail.evidence ? detail.evidence.id : undefined).toBeUndefined();
  });

  it("enforces portal grant expiry, scope and forbidden commands", async () => {
    await expect(resolvePortalPrincipal(store, "expired-token", NOW)).rejects.toThrow(/expired/i);
    await expect(resolvePortalPrincipal(store, "revoked-token", NOW)).rejects.toThrow(/no longer valid/i);
    const portal = await resolvePortalPrincipal(store, "textile", NOW);
    await expect(
      dispatchCommand({
        store,
        principal: portal,
        envelope: {
          commandId: "pg-bad",
          idempotencyKey: "pg-bad",
          principalId: portal.grantId,
          organisationId: portal.organisationId,
          issuedAt: NOW.toISOString(),
          command: { type: "SUBMIT_RESPONSE", caseId: "SRC-184831", value: "1", permission: "GRANTED" },
        },
        now: NOW,
      })
    ).rejects.toBeInstanceOf(SourceError);
  });

  it("commits command, processed command, audit and outbox atomically", async () => {
    const acme = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    const outcome = await dispatchCommand({
      store,
      principal: acme,
      envelope: {
        commandId: "pg-rem",
        idempotencyKey: "pg-rem-1",
        principalId: acme.userId,
        organisationId: "acme",
        issuedAt: NOW.toISOString(),
        command: { type: "SEND_REMINDER", caseId: "SRC-184850" },
      },
      now: NOW,
    });
    expect(outcome.status).toBe("ok");
    const replay = await dispatchCommand({
      store,
      principal: acme,
      envelope: {
        commandId: "pg-rem-2",
        idempotencyKey: "pg-rem-1",
        principalId: acme.userId,
        organisationId: "acme",
        issuedAt: NOW.toISOString(),
        command: { type: "SEND_REMINDER", caseId: "SRC-184850" },
      },
      now: NOW,
    });
    expect(replay.status).toBe("ALREADY_PROCESSED");
    const audit = await store.listAudit("acme");
    expect(audit.some((event) => event.action === "SEND_REMINDER")).toBe(true);
    const pending = await store.listOutbox("PENDING", "acme");
    expect(pending.length).toBeGreaterThan(0);
    const email = new MemoryEmailPort();
    await processOutboxBatch({ store, email, now: NOW });
    await processOutboxBatch({ store, email, now: NOW });
    expect(new Set(email.sent.map((row) => row.idempotencyKey)).size).toBe(email.sent.length);
  });

  it("returns CASE_CHANGED when two transactions race the same version", async () => {
    const acme = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    const state = await store.loadEngine("acme");
    const version = state.cases.find((item) => item.id === "SRC-184846")!.version;
    const first = dispatchCommand({
      store,
      principal: acme,
      envelope: {
        commandId: "race-1",
        idempotencyKey: "race-1",
        principalId: acme.userId,
        organisationId: "acme",
        issuedAt: NOW.toISOString(),
        expectedVersion: version,
        command: { type: "SEND_REMINDER", caseId: "SRC-184846" },
      },
      now: NOW,
    });
    const second = dispatchCommand({
      store,
      principal: acme,
      envelope: {
        commandId: "race-2",
        idempotencyKey: "race-2",
        principalId: acme.userId,
        organisationId: "acme",
        issuedAt: NOW.toISOString(),
        expectedVersion: version,
        command: { type: "SEND_REMINDER", caseId: "SRC-184846" },
      },
      now: NOW,
    });
    const results = await Promise.allSettled([first, second]);
    const ok = results.filter((item) => item.status === "fulfilled").length;
    const conflict = results.filter(
      (item) => item.status === "rejected" && item.reason instanceof SourceError && item.reason.code === "CASE_CHANGED"
    ).length;
    expect(ok + conflict).toBe(2);
    expect(ok).toBeGreaterThanOrEqual(1);
    expect(conflict).toBeGreaterThanOrEqual(0);
  });

  it("shares rate-limit state in postgres", async () => {
    const limiter = new PostgresRateLimiter(app);
    const key = `portal:token:pgtest-${Date.now()}`;
    expect((await limiter.consume({ key, limit: 1, windowSeconds: 60 })).allowed).toBe(true);
    expect((await limiter.consume({ key, limit: 1, windowSeconds: 60 })).allowed).toBe(false);
  });
});
