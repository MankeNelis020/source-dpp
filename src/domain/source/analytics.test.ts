import { describe, expect, it } from "vitest";
import { emptyState } from "@/domain/source/engine";
import { capturePilotSnapshot, evaluatePilotRun, recordContactAvoided, recordRequirementOutcome } from "@/domain/source/analytics";
import type { EngineState, PilotRun } from "@/domain/source/types";

const NOW = new Date("2026-08-18T10:00:00.000Z");

function withMissing(state: EngineState): EngineState {
  state.subjects.push({ id: "p1", kind: "PRODUCT", name: "Chair", createdAt: NOW.toISOString(), source: "IMPORTED" });
  state.requirements.push({
    id: "req-1",
    tenantId: state.tenant.id,
    subjectId: "p1",
    subjectLabel: "Chair",
    productIds: ["p1"],
    propertyId: "recycled_content",
    propertyLabel: "Recycled content",
    datasetId: "espr",
    purpose: "DPP_COMPLIANCE",
    requiredTrustLevel: "EVIDENCED",
    requiredPermissionLevel: "granted",
    requiredBy: "2027-01-01",
    priority: 1,
    createdAt: NOW.toISOString(),
  });
  state.requirements.push({
    id: "req-2",
    tenantId: state.tenant.id,
    subjectId: "p1",
    subjectLabel: "Chair",
    productIds: ["p1"],
    propertyId: "origin_country",
    propertyLabel: "Origin",
    datasetId: "espr",
    purpose: "DPP_COMPLIANCE",
    requiredTrustLevel: "EVIDENCED",
    requiredPermissionLevel: "granted",
    requiredBy: "2027-01-01",
    priority: 1,
    createdAt: NOW.toISOString(),
  });
  return state;
}

describe("pilot metrics", () => {
  it("counts avoided contact once per requirement and does not double-count mechanisms", () => {
    const state = withMissing(emptyState({ id: "pilot", name: "Pilot Co" }));
    const baseline = capturePilotSnapshot(state, NOW);
    expect(baseline.missing).toBe(2);
    const run: PilotRun = {
      id: "run-1",
      organisationId: "pilot",
      datasetId: "test",
      datasetVersion: "v1",
      startedAt: NOW.toISOString(),
      executionStartedAt: NOW.toISOString(),
      baseline,
    };
    state.pilotRuns.push(run);
    state.requirements[0].resolvedAt = "2026-08-18T11:00:00.000Z";
    recordRequirementOutcome(state, {
      requirementId: "req-1",
      mechanism: "EXISTING_CLAIM",
      recordedAt: "2026-08-18T11:00:00.000Z",
    });
    recordContactAvoided(state, {
      requirementId: "req-1",
      avoidedBy: "EXISTING_CLAIM",
      timestamp: "2026-08-18T11:00:00.000Z",
    });
    recordContactAvoided(state, {
      requirementId: "req-1",
      avoidedBy: "EXISTING_CLAIM",
      timestamp: "2026-08-18T11:00:00.000Z",
    });
    state.requirements[1].resolvedAt = "2026-08-18T12:00:00.000Z";
    recordRequirementOutcome(state, {
      requirementId: "req-2",
      mechanism: "SUPPLIER_RESPONSE",
      recordedAt: "2026-08-18T12:00:00.000Z",
    });
    const evaluation = evaluatePilotRun(state, run);
    expect(evaluation.initialMissing).toBe(2);
    expect(evaluation.resolvedWithoutOutreach).toBe(1);
    expect(evaluation.resolvedSupplierResponse).toBe(1);
    expect(evaluation.resolvedWithoutOutreach + evaluation.resolvedSupplierResponse).toBe(2);
    expect(evaluation.supplierContactsAvoided).toBe(1);
    expect(evaluation.contactAvoidanceRate).toBe(0.5);
  });
});
