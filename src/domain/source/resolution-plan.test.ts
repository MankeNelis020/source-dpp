import { describe, expect, it } from "vitest";
import { applyCommand, emptyState } from "@/domain/source/engine";
import { createSeedState } from "@/domain/source/seed";
import {
  assertResolutionPlanComplete,
  classifyMissingRequirement,
  resolutionPlanInvariantHolds,
  sourceHasExecutablePlan,
  summarizeMissingRequirements,
  type ResolutionPlanSummary,
} from "@/domain/source/resolution-plan";
import type { InformationRequirement } from "@/domain/source/types";
import { MemoryPersistence } from "@/infrastructure/database/memory";
import { createImportJob } from "@/server/source/import/service";
import { resolveUserPrincipal } from "@/server/source/commands/dispatch";
import { ROLE_CAPABILITIES } from "@/server/source/authorization";
import { getWorkspaceOverview } from "@/server/source/queries";

const NOW = new Date("2026-08-19T11:00:00.000Z");

function req(id: string, partial: Partial<InformationRequirement> = {}): InformationRequirement {
  return {
    id,
    tenantId: "acme",
    subjectId: `sub-${id}`,
    subjectLabel: "Part",
    productIds: ["p1"],
    propertyId: "country_of_manufacture",
    propertyLabel: "Country of manufacture",
    datasetId: "pilot-missing-information-v1",
    purpose: "DPP_COMPLIANCE",
    requiredTrustLevel: "EVIDENCED",
    requiredPermissionLevel: "granted",
    requiredBy: "2027-02-01",
    priority: 50,
    createdAt: NOW.toISOString(),
    ...partial,
  };
}

function valid(summary: ResolutionPlanSummary) {
  expect(resolutionPlanInvariantHolds(summary)).toBe(true);
  expect(() => assertResolutionPlanComplete(summary)).not.toThrow();
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

describe("resolution plan invariant", () => {
  it("accepts 20 missing / 0 auto / 20 supplier / 0 user / 0 review", () => {
    const summary: ResolutionPlanSummary = {
      missing: 20,
      automatic: 0,
      supplierAction: 20,
      userAction: 0,
      reviewOrBlocked: 0,
      unclassified: [],
    };
    valid(summary);
    expect(sourceHasExecutablePlan(summary)).toBe(true);
  });

  it("accepts a mixed 20-requirement plan that sums", () => {
    const summary: ResolutionPlanSummary = {
      missing: 20,
      automatic: 5,
      supplierAction: 10,
      userAction: 3,
      reviewOrBlocked: 2,
      unclassified: [],
    };
    valid(summary);
  });

  it("rejects 20 missing with every action bucket at zero", () => {
    const summary: ResolutionPlanSummary = {
      missing: 20,
      automatic: 0,
      supplierAction: 0,
      userAction: 0,
      reviewOrBlocked: 0,
      unclassified: [],
    };
    expect(resolutionPlanInvariantHolds(summary)).toBe(false);
    expect(() => assertResolutionPlanComplete(summary)).toThrow(/incomplete/);
  });
});

describe("missing requirement dispositions", () => {
  it("treats unknown supplier as user action, never dropped", () => {
    const state = emptyState();
    const opened = applyCommand(state, { type: "OPEN_REQUIREMENT", requirement: req("r1"), planOnly: true }, NOW);
    const requirement = opened.state.requirements[0];
    const resolution = opened.state.cases[0];
    expect(requirement.selectedRoute).toBe("human_review");
    expect(resolution.state).toBe("REVIEW_ROUTING");
    expect(classifyMissingRequirement(requirement, resolution)).toBe("user_action");
    expect(opened.state.tasks.some((t) => t.kind === "review" && t.caseId === resolution.id)).toBe(true);
    const summary = summarizeMissingRequirements(opened.state);
    expect(summary).toMatchObject({ missing: 1, automatic: 0, supplierAction: 0, userAction: 1, reviewOrBlocked: 0 });
    valid(summary);
    expect(sourceHasExecutablePlan(summary)).toBe(false);
  });

  it("treats known supplier with valid email as supplier action", () => {
    const state = emptyState();
    state.actors.push({ id: "SUP-001", name: "Northwood", legalName: "Northwood Components GmbH", kind: "organisation", country: "DE" });
    state.contacts.push({
      id: "ct-1",
      actorId: "SUP-001",
      role: "product_data",
      name: "Northwood",
      email: "niel.baaijens@gmail.com",
      valid: true,
    });
    const opened = applyCommand(
      state,
      { type: "OPEN_REQUIREMENT", requirement: req("r1"), declaredSupplierId: "SUP-001", planOnly: true },
      NOW
    );
    expect(opened.state.requirements[0].selectedRoute).toBe("supplier_request");
    expect(opened.state.cases[0].state).toBe("DETECTED");
    expect(opened.state.requests).toHaveLength(0);
    const summary = summarizeMissingRequirements(opened.state);
    expect(summary).toMatchObject({ missing: 1, automatic: 0, supplierAction: 1, userAction: 0, reviewOrBlocked: 0 });
    valid(summary);
    expect(sourceHasExecutablePlan(summary)).toBe(true);
  });

  it("treats known supplier without email as user/contact action", () => {
    const state = emptyState();
    state.actors.push({ id: "SUP-001", name: "Northwood", legalName: "Northwood Components GmbH", kind: "organisation", country: "DE" });
    const opened = applyCommand(
      state,
      { type: "OPEN_REQUIREMENT", requirement: req("r1"), declaredSupplierId: "SUP-001", planOnly: true },
      NOW
    );
    expect(opened.state.requirements[0].selectedRoute).toBe("alternative_contact");
    expect(opened.state.cases[0].state).toBe("CONTACT_REQUIRED");
    expect(opened.state.tasks.some((t) => t.kind === "contact")).toBe(true);
    const summary = summarizeMissingRequirements(opened.state);
    expect(summary).toMatchObject({ missing: 1, automatic: 0, supplierAction: 0, userAction: 1, reviewOrBlocked: 0 });
    valid(summary);
    expect(sourceHasExecutablePlan(summary)).toBe(false);
  });

  it("treats existing trusted evidence as an autonomous ready path", () => {
    const state = emptyState();
    state.actors.push({ id: "s", name: "S", legalName: "S GmbH", kind: "organisation", country: "DE" });
    state.contacts.push({ id: "ct", actorId: "s", role: "product_data", name: "S", email: "s@example.com", valid: true });
    const requirement = req("r1", { subjectId: "FRAME-A2", propertyId: "recycled_content" });
    state.claims.push({
      id: "claim-1",
      propertyId: "recycled_content",
      value: "68",
      subjectId: "FRAME-A2",
      productId: "p1",
      declaredByActorId: "s",
      trustLevel: "VERIFIED",
      permissionState: "GRANTED",
      purpose: "DPP_COMPLIANCE",
      identityConfidence: 99,
      ready: true,
    });
    state.permissions.push({
      id: "perm-1",
      claimId: "claim-1",
      granteeActorId: "acme",
      purpose: "DPP_COMPLIANCE",
      state: "GRANTED",
      visibility: "value",
      createdAt: NOW.toISOString(),
    });
    const opened = applyCommand(state, { type: "OPEN_REQUIREMENT", requirement, declaredSupplierId: "s", planOnly: true }, NOW);
    expect(opened.state.requirements[0].selectedRoute).toBe("exact_trusted_claim");
    expect(opened.state.cases[0].state).toBe("READY");
    const summary = summarizeMissingRequirements(opened.state);
    expect(summary.missing).toBe(0);
    valid(summary);
  });

  it("treats conflicting evidence as review", () => {
    const state = emptyState();
    state.actors.push({ id: "supplier-a", name: "A", legalName: "A GmbH", kind: "organisation", country: "DE" });
    state.contacts.push({
      id: "ct",
      actorId: "supplier-a",
      role: "product_data",
      name: "A",
      email: "a@example.com",
      valid: true,
    });
    const opened = applyCommand(
      state,
      { type: "OPEN_REQUIREMENT", requirement: req("r1", { propertyId: "recycled_content" }), declaredSupplierId: "supplier-a" },
      NOW
    );
    const conflicted = applyCommand(
      opened.state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: opened.caseId!,
        value: "67",
        evidence: { filename: "epd.pdf", extractedValue: "42" },
        permission: "GRANTED",
      },
      NOW
    );
    expect(conflicted.state.cases[0].state).toBe("CONFLICT");
    const summary = summarizeMissingRequirements(conflicted.state);
    expect(summary).toMatchObject({ missing: 1, automatic: 0, supplierAction: 0, userAction: 0, reviewOrBlocked: 1 });
    valid(summary);
  });
});

describe("import and workspace share the same plan buckets", () => {
  it("classifies a combined catalogue as 20 supplier-action requirements", async () => {
    const store = new MemoryPersistence();
    const principal = await emptyTenant(store, "plan-northwood");
    const rows = ["sku,name,gtin,manufacturer,supplier_id,vendorname,email,country"];
    for (let i = 1; i <= 20; i += 1) {
      rows.push(
        `SRC-${String(i).padStart(3, "0")},Oak table ${i},871234567${String(8900 + i).slice(-4)},SOURCE Demo Furniture,SUP-001,Northwood Components GmbH,niel.baaijens@gmail.com,DE`
      );
    }
    const job = await createImportJob(store, principal, { products: rows.join("\n") }, NOW);
    expect(job.summary?.products).toBe(20);
    expect(job.summary?.suppliers).toBe(1);
    expect(job.summary?.requirements).toBe(20);
    expect(job.summary?.autoResolvable).toBe(0);
    expect(job.summary?.supplierAction).toBe(20);
    expect(job.summary?.userAction).toBe(0);
    expect(job.summary?.reviewOrBlocked).toBe(0);
    expect(job.summary?.needsAttention).toBe(0);
    expect(job.summary?.sourceHasExecutablePlan).toBe(true);
    valid({
      missing: job.summary!.requirements,
      automatic: job.summary!.autoResolvable,
      supplierAction: job.summary!.supplierAction ?? 0,
      userAction: job.summary!.userAction ?? 0,
      reviewOrBlocked: job.summary!.reviewOrBlocked ?? 0,
      unclassified: [],
    });

    const overview = await getWorkspaceOverview(store, principal);
    expect(overview.summary.missing).toBe(20);
    expect(overview.summary.sourceCanResolve).toBe(0);
    expect(overview.summary.waitingOnSuppliers).toBe(20);
    expect(overview.summary.needsYou).toBe(0);
    expect(overview.summary.missing).toBe(
      overview.summary.sourceCanResolve + overview.summary.waitingOnSuppliers + overview.summary.needsYou
    );
  });

  it("classifies products without suppliers as user action, not as zero-zero", async () => {
    const store = new MemoryPersistence();
    const principal = await emptyTenant(store, "plan-none");
    const job = await createImportJob(
      store,
      principal,
      { products: "sku,name,gtin\nP1,Table,8712345678901\nP2,Chair,8712345678918\n" },
      NOW
    );
    expect(job.summary?.requirements).toBe(2);
    expect(job.summary?.autoResolvable).toBe(0);
    expect(job.summary?.supplierAction).toBe(0);
    expect(job.summary?.userAction).toBe(2);
    expect(job.summary?.sourceHasExecutablePlan).toBe(false);
    const overview = await getWorkspaceOverview(store, principal);
    expect(overview.summary.missing).toBe(2);
    expect(overview.summary.needsYou).toBe(2);
    expect(overview.summary.sourceCanResolve + overview.summary.waitingOnSuppliers + overview.summary.needsYou).toBe(
      overview.summary.missing
    );
  });

  it("keeps the seeded manufacturer workspace on the invariant", () => {
    const summary = summarizeMissingRequirements(createSeedState());
    valid(summary);
  });
});
