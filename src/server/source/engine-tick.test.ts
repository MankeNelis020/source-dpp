import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyState } from "@/domain/source/engine";
import { MemoryPersistence } from "@/infrastructure/database/memory";
import { MemoryEmailPort } from "@/infrastructure/database/ports";
import { createImportJob } from "@/server/source/import/service";
import { resolveUserPrincipal } from "@/server/source/commands/dispatch";
import { executeResolutionRun } from "@/server/source/resolution-run";
import { tickOrganisation } from "@/server/source/engine-tick";
import { processOutboxBatch } from "@/infrastructure/outbox/processor";
import { ROLE_CAPABILITIES } from "@/server/source/authorization";

const NOW = new Date("2026-08-18T10:00:00.000Z");
const LATER = new Date("2026-08-25T10:00:00.000Z");
const FIXTURES = join(process.cwd(), "fixtures/p1-manufacturer");

describe("engine reminder tick", () => {
  it("ticks due waiting cases through dispatch so reminders stay in the outbox", async () => {
    const store = new MemoryPersistence();
    store.organisations.set("holzwerk-tick", { id: "holzwerk-tick", name: "Holzwerk Schmidt GmbH", slug: "holzwerk-tick" });
    store.users.set("user-holzwerk-tick", { id: "user-holzwerk-tick", email: "owner@h.example", displayName: "Owner" });
    store.memberships.push({
      id: "mem-holzwerk-tick",
      userId: "user-holzwerk-tick",
      organisationId: "holzwerk-tick",
      role: "OWNER",
      capabilities: [...ROLE_CAPABILITIES.OWNER],
    });
    store.saveEngine("holzwerk-tick", emptyState({ id: "holzwerk-tick", name: "Holzwerk Schmidt GmbH" }));
    const principal = await resolveUserPrincipal(store, "user-holzwerk-tick", "holzwerk-tick");
    await createImportJob(
      store,
      principal,
      {
        products: readFileSync(join(FIXTURES, "artikelstamm.csv"), "utf8"),
        suppliers: readFileSync(join(FIXTURES, "lieferanten.csv"), "utf8"),
        bom: readFileSync(join(FIXTURES, "stueckliste.csv"), "utf8"),
        materials: readFileSync(join(FIXTURES, "materialien.csv"), "utf8"),
      },
      NOW
    );
    await executeResolutionRun(store, principal, NOW);
    const afterExecute = store.loadEngine("holzwerk-tick");
    const waiting = afterExecute.cases.find((c) => c.state === "WAITING_RESPONSE");
    expect(waiting).toBeTruthy();
    waiting!.nextActionAt = NOW.toISOString();
    store.saveEngine("holzwerk-tick", afterExecute);

    const first = await tickOrganisation(store, "holzwerk-tick", LATER);
    expect(first.ticked).toBeGreaterThan(0);
    const email = new MemoryEmailPort();
    await processOutboxBatch({ store, email, now: LATER });
    expect(email.sent.length).toBeGreaterThan(0);

    await tickOrganisation(store, "holzwerk-tick", LATER);
    const before = email.sent.length;
    await processOutboxBatch({ store, email, now: LATER });
    expect(email.sent.length).toBe(before);
  });
});
