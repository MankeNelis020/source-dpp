import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { emptyState } from "@/domain/source/engine";
import { MemoryPersistence } from "@/infrastructure/database/memory";
import { createImportJob } from "@/server/source/import/service";
import { resolveUserPrincipal } from "@/server/source/commands/dispatch";
import { listCatalogueProducts, listCatalogueSuppliers, listSupplierRequests } from "@/server/source/queries";
import { ROLE_CAPABILITIES } from "@/server/source/authorization";

const NOW = new Date("2026-08-18T10:00:00.000Z");
const FIXTURES = join(process.cwd(), "fixtures/p1-manufacturer");

describe("product cohesion", () => {
  it("does not import demo-data from hosted workspace pages", () => {
    const root = join(process.cwd(), "src/app/app");
    const offenders: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
          const text = readFileSync(path, "utf8");
          if (text.includes("@/lib/source/demo-data")) offenders.push(path);
        }
      }
    }
    walk(root);
    expect(offenders).toEqual([]);
  });

  it("lists imported products from persistence, not demo catalogue counts", async () => {
    const store = new MemoryPersistence();
    store.organisations.set("holzwerk-cat", { id: "holzwerk-cat", name: "Holzwerk Schmidt GmbH", slug: "holzwerk-cat" });
    store.users.set("user-holzwerk-cat", { id: "user-holzwerk-cat", email: "owner@holzwerk.example", displayName: "Schmidt" });
    store.memberships.push({
      id: "mem-holzwerk-cat",
      userId: "user-holzwerk-cat",
      organisationId: "holzwerk-cat",
      role: "OWNER",
      capabilities: [...ROLE_CAPABILITIES.OWNER],
    });
    store.saveEngine("holzwerk-cat", emptyState({ id: "holzwerk-cat", name: "Holzwerk Schmidt GmbH" }));
    const principal = await resolveUserPrincipal(store, "user-holzwerk-cat", "holzwerk-cat");
    expect(await listCatalogueProducts(store, principal)).toEqual([]);
    expect(await listCatalogueSuppliers(store, principal)).toEqual([]);
    expect(await listSupplierRequests(store, principal)).toEqual([]);

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
    const products = await listCatalogueProducts(store, principal);
    expect(products.length).toBeGreaterThan(0);
    expect(products.some((row) => row.name.toLowerCase().includes("stuhl") || row.id.length > 0)).toBe(true);
    expect(JSON.stringify(products)).not.toContain("Urban Chair 04");
  });
});
