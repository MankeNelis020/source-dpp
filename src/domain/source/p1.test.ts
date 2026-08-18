import { describe, expect, it } from "vitest";
import { applyCommand, emptyState } from "@/domain/source/engine";
import { evaluatePilotRun, recordRequirementOutcome } from "@/domain/source/analytics";
import { resolveSubjectIdentity, isGtinValid } from "@/domain/source/subject-identity";
import { planResolution, gatherPlannerInput } from "@/domain/source/planner";
import { evaluatePropagationCandidate, propagateReadyClaim } from "@/domain/source/propagation";
import { proposeMapping, createImportJob, parseCsv } from "@/server/source/import/service";
import { MemoryPersistence } from "@/infrastructure/database/memory";
import { resolveUserPrincipal } from "@/server/source/commands/dispatch";
import { executeResolutionRun } from "@/server/source/resolution-run";
import { PILOT_DATASET_ID } from "@/domain/source/pilot-dataset";
import type { InformationRequirement, PilotRun } from "@/domain/source/types";

const NOW = new Date("2026-08-18T09:00:00.000Z");

function req(partial: Partial<InformationRequirement> = {}): InformationRequirement {
  return {
    id: "req-1",
    tenantId: "acme",
    subjectId: "FRAME-A2",
    subjectLabel: "Frame",
    productIds: ["p1"],
    propertyId: "recycled_content",
    propertyLabel: "Recycled content",
    datasetId: PILOT_DATASET_ID,
    datasetVersion: "1.0.0",
    purpose: "DPP_COMPLIANCE",
    requiredTrustLevel: "EVIDENCED",
    requiredPermissionLevel: "granted",
    requiredBy: "2027-02-01",
    priority: 90,
    createdAt: NOW.toISOString(),
    ...partial,
  };
}

describe("import mapping and messy input", () => {
  it("proposes qualitative mappings for messy European headers", () => {
    const mapping = proposeMapping(["Vendor No.", "EAN Code", "Art. nr.", "Mystery"]);
    expect(mapping["Vendor No."]).toBe("supplier.external_id");
    expect(mapping["EAN Code"]).toBe("product.gtin");
    expect(mapping["Art. nr."]).toBe("product.sku");
    expect(mapping.Mystery).toBe("unknown.Mystery");
  });

  it("parses semicolon CSV and decimal commas without inventing values", () => {
    const parsed = parseCsv("name;percentage\nFrame;12,5\n");
    expect(parsed.rows[0].percentage).toBe("12,5");
    expect(parsed.rows[0].missing).toBeUndefined();
  });

  it("imports a partial catalogue, preserves raw rows, and is idempotent", async () => {
    const store = new MemoryPersistence();
    const principal = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    const files = {
      products: "external_product_id,name,sku,gtin\nP1,Chair,CH-1,8712345678901\nP2,Table,TB-1,not-a-gtin\n,,,\n",
      suppliers: "external_supplier_id,name,legal_name,vat,country\nS1,Acme Metals,ACME Metal B.V.,DE1,DE\nS1,Acme Metals,ACME Metal B.V.,DE1,DE\n",
      bom: "product_id,component_id,component_name,quantity,unit,supplier_id,manufacturer_part_number\nP1,FRAME-A2,FRAME-A2,1,ea,S1,881-A\nP1,FR-1288,FR-1288,1,ea,S1,881-A\n",
      materials: "component_id,material_name,material_code,percentage\nFRAME-A2,Aluminium 6061,AL-6061,100\n",
    };
    const first = await createImportJob(store, principal, files, NOW);
    expect(first.summary?.products).toBe(2);
    expect(first.errorCount).toBeGreaterThan(0);
    expect(first.rawRecords?.some((r) => r.sourceFile === "products" && r.status === "warning")).toBe(true);
    const subjectsAfterFirst = store.loadEngine("acme").subjects.length;
    await createImportJob(store, principal, files, NOW);
    expect(store.loadEngine("acme").subjects.length).toBe(subjectsAfterFirst);
    expect(store.loadEngine("acme").pilotRuns.length).toBeGreaterThan(0);
    expect(store.loadEngine("acme").pilotRuns[0].baseline.missingRequirementIds.length).toBe(
      store.loadEngine("acme").pilotRuns[0].baseline.missing
    );
  });
});

describe("canonical subject identity", () => {
  it("matches exact GTIN and rejects invalid GTINs as identifiers", () => {
    expect(isGtinValid("8712345678901")).toBe(true);
    expect(isGtinValid("12")).toBe(false);
    const state = emptyState();
    state.subjects.push({ id: "s1", kind: "COMPONENT", name: "Frame", createdAt: NOW.toISOString(), source: "IMPORTED" });
    state.subjectIdentifiers.push({ id: "i1", canonicalSubjectId: "s1", scheme: "GTIN", value: "8712345678901" });
    const hit = resolveSubjectIdentity({
      query: { gtin: "8712345678901", kind: "COMPONENT" },
      subjects: state.subjects,
      identifiers: state.subjectIdentifiers,
      mappings: [],
      tenantId: "acme",
    });
    expect(hit.decision).toBe("MATCHED");
    expect(hit.autoLinkAllowed).toBe(true);
  });

  it("does not auto-merge the same MPN from different manufacturers", () => {
    const state = emptyState();
    state.subjects.push(
      { id: "a", kind: "COMPONENT", name: "Acme 881", createdAt: NOW.toISOString(), source: "IMPORTED" },
      { id: "b", kind: "COMPONENT", name: "Other 881", createdAt: NOW.toISOString(), source: "IMPORTED" }
    );
    state.subjectIdentifiers.push(
      { id: "i1", canonicalSubjectId: "a", scheme: "MPN", value: "881-A" },
      { id: "i2", canonicalSubjectId: "b", scheme: "MPN", value: "881-A" }
    );
    const hit = resolveSubjectIdentity({
      query: { mpn: "881-A", kind: "COMPONENT" },
      subjects: state.subjects,
      identifiers: state.subjectIdentifiers,
      mappings: [],
      tenantId: "acme",
    });
    expect(hit.decision).toBe("AMBIGUOUS");
    expect(hit.autoLinkAllowed).toBe(false);
  });

  it("records human merge provenance and rewrites requirements onto the canonical subject", () => {
    const state = emptyState();
    state.subjects.push(
      { id: "FRAME-A2", kind: "COMPONENT", name: "FRAME-A2", createdAt: NOW.toISOString(), source: "IMPORTED" },
      { id: "FR-1288", kind: "COMPONENT", name: "FR-1288", createdAt: NOW.toISOString(), source: "IMPORTED" }
    );
    state.requirements.push(req({ id: "r-a", subjectId: "FRAME-A2" }), req({ id: "r-b", subjectId: "FR-1288" }));
    const merged = applyCommand(state, { type: "MERGE_SUBJECTS", fromSubjectId: "FR-1288", toSubjectId: "FRAME-A2" }, NOW);
    expect(merged.state.subjects.some((s) => s.id === "FR-1288")).toBe(false);
    expect(merged.state.requirements.every((r) => r.subjectId === "FRAME-A2")).toBe(true);
    expect(merged.state.identityDecisions[0]?.decision).toBe("merge");
  });
});

describe("planner wiring and contact avoidance", () => {
  it("uses planResolution from OPEN_REQUIREMENT and records the selected route", () => {
    const state = emptyState();
    state.actors.push({ id: "supplier-a", name: "A", legalName: "A GmbH", kind: "organisation", country: "DE" });
    state.contacts.push({ id: "ct", actorId: "supplier-a", role: "product_data", name: "A", email: "a@example", valid: true });
    const opened = applyCommand(state, { type: "OPEN_REQUIREMENT", requirement: req(), declaredSupplierId: "supplier-a" }, NOW);
    expect(opened.state.requirements[0].selectedRoute).toBe("supplier_request");
    expect(opened.state.requests).toHaveLength(1);
  });

  it("does not send when a compatible claim becomes READY before send", () => {
    const state = emptyState();
    state.actors.push({ id: "supplier-a", name: "A", legalName: "A GmbH", kind: "organisation", country: "DE" });
    state.contacts.push({ id: "ct", actorId: "supplier-a", role: "product_data", name: "A", email: "a@example", valid: true });
    const opened = applyCommand(state, { type: "OPEN_REQUIREMENT", requirement: req(), declaredSupplierId: "supplier-a" }, NOW);
    opened.state.claims.push({
      id: "claim-1",
      requirementId: "req-1",
      propertyId: "recycled_content",
      value: "68",
      subjectId: "FRAME-A2",
      productId: "p1",
      declaredByActorId: "supplier-a",
      trustLevel: "EVIDENCED",
      permissionState: "GRANTED",
      purpose: "DPP_COMPLIANCE",
      identityConfidence: 99,
      ready: true,
      evidenceId: "ev-1",
    });
    opened.state.evidence.push({
      id: "ev-1",
      filename: "cert.pdf",
      sha256: "aa",
      issuer: "Lab",
      ownerActorId: "supplier-a",
      expired: false,
      validUntil: "2028-01-01",
      scope: { kind: "product", id: "FRAME-A2", label: "FRAME-A2" },
      visibility: "public",
      linkedClaimIds: ["claim-1"],
    });
    opened.state.permissions.push({
      id: "perm-1",
      claimId: "claim-1",
      granteeActorId: "acme",
      purpose: "DPP_COMPLIANCE",
      state: "GRANTED",
      visibility: "value",
      createdAt: NOW.toISOString(),
    });
    const sent = applyCommand(opened.state, { type: "SEND_REQUEST", caseId: opened.caseId! }, NOW);
    expect(sent.state.events.some((e) => e.type === "SUPPLIER_CONTACT_AVOIDED")).toBe(true);
    expect(sent.state.cases[0].state).toBe("READY");
    expect(sent.state.contactAvoidances[0]?.avoidedBy).toBe("CONCURRENT_RESOLUTION");
  });
});

describe("propagation scope and identity", () => {
  it("propagates one ready claim to compatible requirements and not to a different material grade", () => {
    const state = emptyState();
    state.subjects.push({ id: "FRAME-A2", kind: "COMPONENT", name: "Frame", createdAt: NOW.toISOString(), source: "IMPORTED" });
    const a = req({ id: "r1", subjectId: "FRAME-A2", linkedCaseId: "c1" });
    const b = req({ id: "r2", subjectId: "FRAME-A2", productIds: ["p2"], linkedCaseId: "c2" });
    const other = req({ id: "r3", subjectId: "AL-7075", productIds: ["p3"], linkedCaseId: "c3" });
    state.requirements.push(a, b, other);
    state.cases.push(
      { id: "c1", requirementId: "r1", state: "READY", nextAction: "", escalationPolicyId: "standard_supplier_14d", openedAt: NOW.toISOString(), version: 1, identityStatus: "IDENTITY_MATCHED", automationLevel: "L2" },
      { id: "c2", requirementId: "r2", state: "DETECTED", nextAction: "", escalationPolicyId: "standard_supplier_14d", openedAt: NOW.toISOString(), version: 1, identityStatus: "IDENTITY_MATCHED", automationLevel: "L2" },
      { id: "c3", requirementId: "r3", state: "DETECTED", nextAction: "", escalationPolicyId: "standard_supplier_14d", openedAt: NOW.toISOString(), version: 1, identityStatus: "IDENTITY_MATCHED", automationLevel: "L2" }
    );
    state.claims.push({
      id: "claim-ready",
      requirementId: "r1",
      propertyId: "recycled_content",
      value: "68",
      subjectId: "FRAME-A2",
      productId: "p1",
      declaredByActorId: "supplier-a",
      trustLevel: "VERIFIED",
      permissionState: "GRANTED",
      purpose: "DPP_COMPLIANCE",
      identityConfidence: 99,
      ready: true,
      evidenceId: "ev",
      validUntil: "2028-01-01",
    });
    state.evidence.push({
      id: "ev",
      filename: "cert.pdf",
      sha256: "aa",
      issuer: "Lab",
      ownerActorId: "supplier-a",
      expired: false,
      validUntil: "2028-01-01",
      scope: { kind: "product", id: "FRAME-A2", label: "Frame" },
      visibility: "public",
      linkedClaimIds: ["claim-ready"],
    });
    state.permissions.push({
      id: "perm",
      claimId: "claim-ready",
      granteeActorId: "acme",
      purpose: "DPP_COMPLIANCE",
      state: "GRANTED",
      visibility: "value",
      createdAt: NOW.toISOString(),
    });
    a.resolvedAt = NOW.toISOString();
    const result = propagateReadyClaim(state, "claim-ready", NOW);
    expect(result.state.requirements.find((r) => r.id === "r2")?.resolvedAt).toBeTruthy();
    expect(result.state.requirements.find((r) => r.id === "r3")?.resolvedAt).toBeFalsy();
    expect(result.state.requirementOutcomes.some((o) => o.mechanism === "SAME_TENANT_REUSE")).toBe(true);
  });

  it("does not propagate expired evidence, denied permission, conflicts, or ambiguous identity", () => {
    const requirement = req();
    const claim = {
      id: "c",
      propertyId: "recycled_content",
      value: "1",
      subjectId: "FRAME-A2",
      productId: "p1",
      declaredByActorId: "s",
      trustLevel: "EVIDENCED" as const,
      permissionState: "GRANTED" as const,
      purpose: "DPP_COMPLIANCE" as const,
      identityConfidence: 99,
      ready: true,
    };
    expect(
      evaluatePropagationCandidate({
        claim,
        requirement,
        evidence: { id: "e", filename: "x", sha256: "0", issuer: "i", ownerActorId: "s", expired: true, scope: { kind: "product", id: "FRAME-A2", label: "x" }, visibility: "public", linkedClaimIds: [] },
        requestingOrganisationId: "acme",
        now: NOW,
      })
    ).toBe("EXPIRED");
    expect(
      evaluatePropagationCandidate({
        claim,
        requirement,
        permission: { id: "p", claimId: "c", granteeActorId: "other", purpose: "DPP_COMPLIANCE", state: "DENIED", visibility: "restricted", createdAt: NOW.toISOString() },
        requestingOrganisationId: "acme",
        now: NOW,
      })
    ).toBe("PRIVATE");
    expect(evaluatePropagationCandidate({ claim, requirement, requestingOrganisationId: "acme", now: NOW, conflict: true })).toBe("NO_MATCH");
    expect(evaluatePropagationCandidate({ claim, requirement, requestingOrganisationId: "acme", now: NOW, identityMatched: false })).toBe("NO_MATCH");
  });
});

describe("pilot metrics from events", () => {
  it("reconstructs avoidance and attribution from a known 100-requirement fixture", () => {
    const state = emptyState();
    const missing = Array.from({ length: 60 }, (_, i) => `m-${i}`);
    const already = Array.from({ length: 40 }, (_, i) => `a-${i}`);
    for (const id of [...already, ...missing]) {
      state.requirements.push(req({ id, resolvedAt: already.includes(id) ? NOW.toISOString() : undefined }));
    }
    for (let i = 0; i < 20; i += 1) {
      recordRequirementOutcome(state, { requirementId: `m-${i}`, mechanism: "SAME_TENANT_REUSE", recordedAt: NOW.toISOString() });
      state.requirements.find((r) => r.id === `m-${i}`)!.resolvedAt = NOW.toISOString();
    }
    for (let i = 20; i < 30; i += 1) {
      recordRequirementOutcome(state, { requirementId: `m-${i}`, mechanism: "SUPPLIER_RESPONSE", recordedAt: NOW.toISOString() });
      state.requirements.find((r) => r.id === `m-${i}`)!.resolvedAt = NOW.toISOString();
    }
    for (let i = 30; i < 35; i += 1) {
      recordRequirementOutcome(state, { requirementId: `m-${i}`, mechanism: "HUMAN_ENTRY", recordedAt: NOW.toISOString() });
      state.requirements.find((r) => r.id === `m-${i}`)!.resolvedAt = NOW.toISOString();
    }
    const run: PilotRun = {
      id: "pilot-1",
      organisationId: "acme",
      datasetId: PILOT_DATASET_ID,
      datasetVersion: "1.0.0",
      startedAt: NOW.toISOString(),
      baseline: {
        capturedAt: NOW.toISOString(),
        totalProducts: 10,
        totalSubjects: 10,
        totalSuppliers: 3,
        totalRequirements: 100,
        alreadyReady: 40,
        missing: 60,
        conflicted: 0,
        identityUncertain: 0,
        evidenceMissing: 0,
        permissionBlocked: 0,
        requirementIds: state.requirements.map((r) => r.id),
        missingRequirementIds: missing,
      },
    };
    const evaluation = evaluatePilotRun(state, run);
    expect(evaluation.initialMissing).toBe(60);
    expect(evaluation.resolvedSameTenant).toBe(20);
    expect(evaluation.resolvedSupplierResponse).toBe(10);
    expect(evaluation.resolvedHuman).toBe(5);
    expect(evaluation.resolvedWithoutOutreach).toBe(20);
    expect(evaluation.contactAvoidanceRate).toBeCloseTo(20 / 60, 5);
  });
});

describe("resolution run uses the planner without inventing counts", () => {
  it("creates a baseline during import and executes planned outreach only afterwards", async () => {
    const store = new MemoryPersistence();
    const principal = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    await createImportJob(store, principal, {
      products: "external_product_id,name,sku\nPX,Pilot Chair,PX\n",
      suppliers: "external_supplier_id,name,legal_name,vat,country,email\nSX,Pilot Metals,Pilot Metals BV,NL1,NL,data@sx.example\n",
      bom: "product_id,component_id,component_name,supplier_id\nPX,FRAME-PX,Pilot Frame,SX\n",
    }, NOW);
    const afterImport = store.loadEngine("acme");
    expect(afterImport.pilotRuns.length).toBeGreaterThan(0);
    const run = afterImport.pilotRuns[afterImport.pilotRuns.length - 1];
    expect(run.baseline.missingRequirementIds.length).toBe(run.baseline.missing);
    const requestsBefore = afterImport.requests.length;
    await executeResolutionRun(store, principal, NOW);
    const afterRun = store.loadEngine("acme");
    expect(afterRun.pilotRuns[0].completedAt).toBeTruthy();
    expect(afterRun.requests.length).toBeGreaterThanOrEqual(requestsBefore);
  });
});

describe("planner gather", () => {
  it("prefers an existing trusted claim over a supplier request", () => {
    const state = emptyState();
    const requirement = req();
    state.requirements.push(requirement);
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
      id: "p",
      claimId: "claim-1",
      granteeActorId: "acme",
      purpose: "DPP_COMPLIANCE",
      state: "GRANTED",
      visibility: "value",
      createdAt: NOW.toISOString(),
    });
    const plan = planResolution(
      gatherPlannerInput({
        state,
        requirement,
        identityMatched: true,
        identityNeedsReview: false,
        declaredSupplierId: "s",
        now: NOW,
      })
    );
    expect(plan.strategy).toBe("exact_trusted_claim");
  });
});
