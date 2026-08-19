import { describe, expect, it } from "vitest";
import { emptyState } from "@/domain/source/engine";
import { gatherPlannerInput, planResolution } from "@/domain/source/planner";
import { MemoryPersistence } from "@/infrastructure/database/memory";
import { createImportJob, reprocessImportJob } from "@/server/source/import/service";
import { resolveUserPrincipal } from "@/server/source/commands/dispatch";
import { ROLE_CAPABILITIES } from "@/server/source/authorization";
import { getProductDetail, listCatalogueProducts, listCatalogueSuppliers } from "@/server/source/queries";
import type { EngineState } from "@/domain/source/types";

const NOW = new Date("2026-08-19T09:00:00.000Z");

function gtin(n: number) {
  return String(8712345678900 + n);
}

function combinedProductsCsv(
  rows: Array<{
    sku: string;
    name: string;
    gtin: string;
    manufacturer?: string;
    supplierId?: string;
    vendorname?: string;
    email?: string;
    country?: string;
  }>
) {
  const header = "sku,name,gtin,manufacturer,supplier_id,vendorname,email,country";
  const lines = rows.map((row) =>
    [
      row.sku,
      row.name,
      row.gtin,
      row.manufacturer ?? "SOURCE Demo Furniture",
      row.supplierId ?? "",
      row.vendorname ?? "",
      row.email ?? "",
      row.country ?? "",
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

const NORTHWOOD = {
  supplierId: "SUP-001",
  vendorname: "Northwood Components GmbH",
  email: "niel.baaijens@gmail.com",
  country: "DE",
};

function northwoodProducts(count: number) {
  return combinedProductsCsv(
    Array.from({ length: count }, (_, i) => ({
      sku: `SRC-${String(i + 1).padStart(3, "0")}`,
      name: `Oak dining table ${180 + i * 10} cm`,
      gtin: gtin(i + 1),
      ...NORTHWOOD,
    }))
  );
}

async function emptyTenant(store: MemoryPersistence, orgId: string) {
  const userId = `user-${orgId}`;
  store.organisations.set(orgId, { id: orgId, name: `${orgId} GmbH`, slug: orgId });
  store.users.set(userId, { id: userId, email: `owner@${orgId}.example`, displayName: "Owner" });
  store.memberships.push({
    id: `mem-${orgId}`,
    userId,
    organisationId: orgId,
    role: "OWNER",
    capabilities: [...ROLE_CAPABILITIES.OWNER],
  });
  store.saveEngine(orgId, emptyState({ id: orgId, name: `${orgId} GmbH` }));
  return resolveUserPrincipal(store, userId, orgId);
}

function catalogueSuppliers(state: EngineState) {
  return state.actors.filter((a) => a.kind === "organisation" && a.id !== state.tenant.id);
}

describe("combined product CSV supplier identification", () => {
  it("creates one supplier from repeated inline vendor columns and links every product", async () => {
    const store = new MemoryPersistence();
    const principal = await emptyTenant(store, "inline-northwood");
    const job = await createImportJob(store, principal, { products: northwoodProducts(5) }, NOW);

    expect(job.summary?.products).toBe(5);
    expect(job.summary?.suppliers).toBe(1);
    expect(job.summary?.productSupplierRelationships).toBe(5);
    expect(job.summary?.relationships).toBe(0);
    expect(job.summary?.requirements).toBe(5);
    expect(job.summary?.autoResolvable).toBe(0);
    expect(job.summary?.supplierAction).toBe(5);
    expect(job.summary?.userAction).toBe(0);
    expect(job.summary?.reviewOrBlocked).toBe(0);
    expect(job.summary?.sourceHasExecutablePlan).toBe(true);

    const state = store.loadEngine(principal.organisationId);
    const suppliers = catalogueSuppliers(state);
    expect(suppliers).toHaveLength(1);
    expect(suppliers[0].id).toBe("SUP-001");
    expect(suppliers[0].name).toBe("Northwood Components GmbH");
    expect(suppliers[0].country).toBe("DE");
    expect(state.contacts.some((c) => c.actorId === "SUP-001" && c.email === "niel.baaijens@gmail.com" && c.valid)).toBe(
      true
    );

    const products = state.subjects.filter((s) => s.kind === "PRODUCT");
    expect(products).toHaveLength(5);
    expect(products.every((p) => p.declaredSupplierId === "SUP-001")).toBe(true);
    expect(products.every((p) => p.sourceReference?.startsWith("products:"))).toBe(true);

    const linkedCases = state.cases.filter((c) =>
      products.some((p) => {
        const requirement = state.requirements.find((r) => r.id === c.requirementId);
        return c.productId === p.id || requirement?.subjectId === p.id;
      })
    );
    expect(linkedCases.length).toBeGreaterThan(0);
    expect(linkedCases.every((c) => c.supplierId === "SUP-001")).toBe(true);

    const listed = await listCatalogueSuppliers(store, principal);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe("SUP-001");
    expect(listed[0].productsSupplied).toBe(5);

    const catalogue = await listCatalogueProducts(store, principal);
    expect(catalogue.every((p) => p.supplierLabel === "Northwood Components GmbH")).toBe(true);

    const detail = await getProductDetail(store, principal, products[0].id);
    expect(detail.supplierId).toBe("SUP-001");
    expect(detail.supplierLabel).toBe("Northwood Components GmbH");

    const requirement = state.requirements.find((r) => r.subjectId === products[0].id)!;
    const plan = planResolution(
      gatherPlannerInput({
        state,
        requirement,
        identityMatched: true,
        identityNeedsReview: false,
        declaredSupplierId: products[0].declaredSupplierId,
        now: NOW,
      })
    );
    expect(plan.strategy).toBe("supplier_request");
    expect(plan.candidateActorId).toBe("SUP-001");
  });

  it("does not duplicate suppliers or relationships when the same file is imported again", async () => {
    const store = new MemoryPersistence();
    const principal = await emptyTenant(store, "inline-reprocess");
    const files = { products: northwoodProducts(4) };
    await createImportJob(store, principal, files, NOW);
    const afterFirst = store.loadEngine(principal.organisationId);
    const actorsAfterFirst = catalogueSuppliers(afterFirst).length;
    const productsAfterFirst = afterFirst.subjects.filter((s) => s.kind === "PRODUCT").length;
    const casesAfterFirst = afterFirst.cases.length;

    const second = await createImportJob(store, principal, files, NOW);
    const afterSecond = store.loadEngine(principal.organisationId);
    expect(second.summary?.suppliers).toBe(1);
    expect(catalogueSuppliers(afterSecond)).toHaveLength(actorsAfterFirst);
    expect(afterSecond.subjects.filter((s) => s.kind === "PRODUCT")).toHaveLength(productsAfterFirst);
    expect(afterSecond.cases.length).toBe(casesAfterFirst);
    expect(afterSecond.contacts.filter((c) => c.actorId === "SUP-001")).toHaveLength(1);

    const reprocessed = await reprocessImportJob(store, principal, second.id, NOW);
    expect(reprocessed.summary?.suppliers).toBe(1);
    expect(catalogueSuppliers(store.loadEngine(principal.organisationId))).toHaveLength(1);
  });

  it("creates two suppliers for two different inline vendor identities", async () => {
    const store = new MemoryPersistence();
    const principal = await emptyTenant(store, "inline-two");
    const job = await createImportJob(
      store,
      principal,
      {
        products: combinedProductsCsv([
          { sku: "P1", name: "Table", gtin: gtin(1), ...NORTHWOOD },
          {
            sku: "P2",
            name: "Chair",
            gtin: gtin(2),
            supplierId: "SUP-002",
            vendorname: "Alpine Hardware AG",
            email: "parts@alpine-hardware.example",
            country: "AT",
          },
        ]),
      },
      NOW
    );
    expect(job.summary?.products).toBe(2);
    expect(job.summary?.suppliers).toBe(2);
    expect(job.summary?.productSupplierRelationships).toBe(2);
    const state = store.loadEngine(principal.organisationId);
    expect(catalogueSuppliers(state).map((a) => a.id).sort()).toEqual(["SUP-001", "SUP-002"]);
    const products = state.subjects.filter((s) => s.kind === "PRODUCT");
    expect(new Set(products.map((p) => p.declaredSupplierId))).toEqual(new Set(["SUP-001", "SUP-002"]));
  });

  it("deduplicates an inline supplier that also appears in suppliers.csv", async () => {
    const store = new MemoryPersistence();
    const principal = await emptyTenant(store, "inline-plus-file");
    const job = await createImportJob(
      store,
      principal,
      {
        products: northwoodProducts(3),
        suppliers:
          "external_supplier_id,name,legal_name,email,country\nSUP-001,Northwood Components GmbH,Northwood Components GmbH,niel.baaijens@gmail.com,DE\n",
      },
      NOW
    );
    expect(job.summary?.suppliers).toBe(1);
    expect(job.summary?.productSupplierRelationships).toBe(3);
    expect(catalogueSuppliers(store.loadEngine(principal.organisationId))).toHaveLength(1);
  });

  it("keeps a review item when the same supplier id carries conflicting attributes", async () => {
    const store = new MemoryPersistence();
    const principal = await emptyTenant(store, "inline-conflict");
    const job = await createImportJob(
      store,
      principal,
      {
        products: combinedProductsCsv([
          { sku: "P1", name: "Table", gtin: gtin(1), ...NORTHWOOD },
          {
            sku: "P2",
            name: "Chair",
            gtin: gtin(2),
            supplierId: "SUP-001",
            vendorname: "Southwood Metals AG",
            email: "other@southwood.example",
            country: "AT",
          },
        ]),
      },
      NOW
    );
    const state = store.loadEngine(principal.organisationId);
    expect(catalogueSuppliers(state)).toHaveLength(1);
    expect(catalogueSuppliers(state)[0].name).toBe("Northwood Components GmbH");
    expect(job.summary?.identityReviews).toBeGreaterThan(0);
    expect(state.tasks.some((t) => t.kind === "identity")).toBe(true);
  });

  it("imports products with no supplier fields and reports zero suppliers", async () => {
    const store = new MemoryPersistence();
    const principal = await emptyTenant(store, "inline-none");
    const job = await createImportJob(
      store,
      principal,
      {
        products: "sku,name,gtin,manufacturer\nSRC-001,Oak table,8712345678901,SOURCE Demo Furniture\nSRC-002,Oak bench,8712345678918,SOURCE Demo Furniture\n",
      },
      NOW
    );
    expect(job.summary?.products).toBe(2);
    expect(job.summary?.suppliers).toBe(0);
    expect(job.summary?.productSupplierRelationships).toBe(0);
    expect(job.summary?.requirements).toBe(2);
    expect(job.summary?.autoResolvable).toBe(0);
    expect(job.summary?.supplierAction).toBe(0);
    expect(job.summary?.userAction).toBe(2);
    expect(job.summary?.sourceHasExecutablePlan).toBe(false);
    const state = store.loadEngine(principal.organisationId);
    expect(catalogueSuppliers(state)).toHaveLength(0);
    expect(state.subjects.filter((s) => s.kind === "PRODUCT")).toHaveLength(2);
    expect(state.subjects.every((s) => !s.declaredSupplierId)).toBe(true);
  });

  it("does not create an unnamed supplier from email-only columns", async () => {
    const store = new MemoryPersistence();
    const principal = await emptyTenant(store, "inline-email-only");
    const job = await createImportJob(
      store,
      principal,
      {
        products: "sku,name,gtin,email\nP1,Table,8712345678901,niel.baaijens@gmail.com\n",
      },
      NOW
    );
    expect(job.summary?.products).toBe(1);
    expect(job.summary?.suppliers).toBe(0);
    expect(catalogueSuppliers(store.loadEngine(principal.organisationId))).toHaveLength(0);
  });

  it("creates a supplier candidate from a vendor name without an external id", async () => {
    const store = new MemoryPersistence();
    const principal = await emptyTenant(store, "inline-name-only");
    const job = await createImportJob(
      store,
      principal,
      {
        products: combinedProductsCsv([
          { sku: "P1", name: "Table", gtin: gtin(1), vendorname: "Northwood Components GmbH", country: "DE" },
          { sku: "P2", name: "Bench", gtin: gtin(2), vendorname: "Northwood Components GmbH", country: "DE" },
        ]),
      },
      NOW
    );
    expect(job.summary?.suppliers).toBe(1);
    expect(job.summary?.productSupplierRelationships).toBe(2);
    const suppliers = catalogueSuppliers(store.loadEngine(principal.organisationId));
    expect(suppliers).toHaveLength(1);
    expect(suppliers[0].name).toBe("Northwood Components GmbH");
    expect(suppliers[0].id).toBe("northwood-components-gmbh");
  });

  it("keeps tenant isolation for the same inline supplier identity", async () => {
    const store = new MemoryPersistence();
    const a = await emptyTenant(store, "inline-tenant-a");
    const b = await emptyTenant(store, "inline-tenant-b");
    await createImportJob(store, a, { products: northwoodProducts(2) }, NOW);
    await createImportJob(store, b, { products: northwoodProducts(3) }, NOW);

    expect(await listCatalogueProducts(store, a)).toHaveLength(2);
    expect(await listCatalogueProducts(store, b)).toHaveLength(3);
    expect(await listCatalogueSuppliers(store, a)).toEqual([
      expect.objectContaining({ id: "SUP-001", productsSupplied: 2 }),
    ]);
    expect(await listCatalogueSuppliers(store, b)).toEqual([
      expect.objectContaining({ id: "SUP-001", productsSupplied: 3 }),
    ]);
  });
});
