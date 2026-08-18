import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { applyMigrations } from "@/infrastructure/database/migrate";
import { PostgresPersistence } from "@/infrastructure/database/postgres";
import { requireDatabaseUrl, runtimeAppDatabaseUrl } from "@/infrastructure/database/seed-postgres";
import { createPostgresPool } from "@/infrastructure/database/pool";
import { ROLE_CAPABILITIES } from "@/server/source/authorization";
import { emptyState } from "@/domain/source/engine";

const NOW = new Date("2026-08-18T10:00:00.000Z");

describe("PR C postgres outbound isolation", () => {
  let migrator: Pool;
  let app: Pool;
  let store: PostgresPersistence;

  beforeAll(async () => {
    const url = requireDatabaseUrl();
    if (!url) throw new Error("DATABASE_URL is required for Postgres integration tests.");
    migrator = createPostgresPool(url, "migrator");
    await applyMigrations(migrator);
    app = createPostgresPool(runtimeAppDatabaseUrl(url), "app");
    store = new PostgresPersistence(app);
    await store.saveOrganisation({ id: "alice-mail-pg", name: "Alice GmbH", slug: "alice-mail-pg" });
    await store.saveOrganisation({ id: "bob-mail-pg", name: "Bob Oy", slug: "bob-mail-pg" });
    await store.saveUser({ id: "user-alice-mail-pg", email: "owner@alice-mail-pg.example", displayName: "Alice" });
    await store.saveMembership({
      id: "mem-alice-mail-pg",
      userId: "user-alice-mail-pg",
      organisationId: "alice-mail-pg",
      role: "OWNER",
      capabilities: [...ROLE_CAPABILITIES.OWNER],
    });
    await store.saveEngine("alice-mail-pg", emptyState({ id: "alice-mail-pg", name: "Alice GmbH" }));
    await store.saveEngine("bob-mail-pg", emptyState({ id: "bob-mail-pg", name: "Bob Oy" }));
  });

  afterAll(async () => {
    await app?.end();
    await migrator?.end();
  });

  it("does not let Alice read Bob's outbound recipient or provider id", async () => {
    await store.saveOutboundMessage({
      id: `omsg-bob-${Date.now()}`,
      organisationId: "bob-mail-pg",
      caseId: "SRC-BOB",
      outboxEventId: "obx-bob-pg",
      semanticKey: `bob-pg:${Date.now()}:REQUEST_INITIAL:v1`,
      recipient: "secret-bob@example.com",
      fromAddress: "SOURCE <requests@localhost>",
      templateId: "SUPPLIER_REQUEST",
      templateVersion: "v1",
      category: "SUPPLIER_REQUEST",
      provider: "TEST",
      providerMessageId: "prov-bob-pg",
      transportStatus: "DELIVERED",
      createdAt: NOW.toISOString(),
      deliveredAt: NOW.toISOString(),
    });
    const aliceRows = await store.listOutboundMessages("alice-mail-pg");
    expect(aliceRows.some((row) => row.recipient === "secret-bob@example.com")).toBe(false);
    const client = await app.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('source.organisation_id', 'alice-mail-pg', true)");
      const visible = await client.query("SELECT recipient FROM outbound_messages WHERE recipient = 'secret-bob@example.com'");
      expect(visible.rowCount).toBe(0);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
});
