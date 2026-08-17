import { describe, expect, it } from "vitest";
import { applyCommand, emptyState } from "./engine";
import { caseReadiness } from "./engine";
import { resolveIdentity } from "./identity";
import { wouldCreateCycle } from "./cycles";
import { nextPendingStep, STANDARD_SUPPLIER_14D } from "./escalation";
import { mayAutoLinkEvidence } from "./readiness";
import { findActiveDuplicate } from "./reuse";
import { manufacturerMaySeeActor } from "./queries";
import type { InformationRequirement } from "./types";

const NOW = new Date("2026-08-17T09:00:00.000Z");

function requirement(id = "req-1"): InformationRequirement {
  return {
    id,
    tenantId: "acme",
    subjectId: "AL-FRAME-881",
    subjectLabel: "Aluminium Frame",
    productIds: ["urban-chair-04"],
    propertyId: "recycled_content",
    propertyLabel: "Recycled content",
    datasetId: "espr-al-2027",
    purpose: "DPP_COMPLIANCE",
    requiredTrustLevel: "EVIDENCED",
    requiredPermissionLevel: "granted",
    requiredBy: "2027-02-01",
    priority: 90,
    createdAt: NOW.toISOString(),
  };
}

function withSupplier() {
  const state = emptyState();
  state.actors.push({
    id: "supplier-a",
    name: "Supplier A",
    legalName: "Supplier A GmbH",
    kind: "organisation",
    vat: "DE813334455",
    country: "Germany",
  });
  state.contacts.push({
    id: "ct-a",
    actorId: "supplier-a",
    role: "product_data",
    name: "Lena",
    email: "data@a.example",
    valid: true,
  });
  return state;
}

describe("acceptance 85 — happy flow", () => {
  it("becomes READY when identity, value, evidence and permission pass", () => {
    const { state, caseId } = applyCommand(
      withSupplier(),
      { type: "OPEN_REQUIREMENT", requirement: requirement(), declaredSupplierId: "supplier-a" },
      NOW
    );
    const submitted = applyCommand(
      state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: caseId!,
        value: "67",
        unit: "%",
        evidence: { filename: "cert.pdf" },
        permission: "GRANTED",
      },
      NOW
    );
    const resolution = submitted.state.cases[0];
    expect(resolution.state).toBe("READY");
    expect(resolution.resolutionOutcome).toBe("READY");
    expect(resolution.downstreamSyncOffered).toBe(true);
    expect(caseReadiness(submitted.state, resolution.id).ready).toBe(true);
  });
});

describe("acceptance 86 — ask my supplier", () => {
  it("creates an upstream attempt on the same case and requirement", () => {
    const opened = applyCommand(
      withSupplier(),
      { type: "OPEN_REQUIREMENT", requirement: requirement(), declaredSupplierId: "supplier-a" },
      NOW
    );
    const state = applyCommand(opened.state, { type: "MARK_UNKNOWN", caseId: opened.caseId!, choice: "ask_supplier" }, NOW).state;
    const forwarded = applyCommand(
      state,
      {
        type: "FORWARD_UPSTREAM",
        caseId: opened.caseId!,
        upstream: { name: "Mill", legalName: "Mill Oy", country: "Finland" },
        mode: "on_behalf",
      },
      NOW
    );
    const resolution = forwarded.state.cases[0];
    expect(forwarded.state.requirements).toHaveLength(1);
    expect(forwarded.state.cases).toHaveLength(1);
    expect(resolution.state).toBe("WAITING_UPSTREAM");
    expect(forwarded.state.attempts.some((a) => a.forwardedUpstream && a.parentAttemptId)).toBe(true);
    expect(forwarded.state.relationships).toHaveLength(1);
  });
});

describe("acceptance 87 — no response", () => {
  it("sends an automatic reminder exactly once and schedules the next step", () => {
    const opened = applyCommand(
      withSupplier(),
      { type: "OPEN_REQUIREMENT", requirement: requirement(), declaredSupplierId: "supplier-a" },
      NOW
    );
    const day3 = new Date("2026-08-20T09:00:00.000Z");
    const first = applyCommand(opened.state, { type: "TICK_NO_RESPONSE", caseId: opened.caseId! }, day3);
    const reminders = first.events.filter((e) => e.type === "AUTO_REMINDER_SENT");
    expect(reminders).toHaveLength(1);
    expect(reminders[0].policy).toBe("standard_supplier_14d");
    expect(reminders[0].policyVersion).toBe("1.0");

    const again = applyCommand(first.state, { type: "TICK_NO_RESPONSE", caseId: opened.caseId! }, day3);
    expect(again.events.filter((e) => e.type === "AUTO_REMINDER_SENT")).toHaveLength(0);

    const pending = nextPendingStep(
      STANDARD_SUPPLIER_14D,
      NOW,
      new Date("2026-08-24T09:00:00.000Z"),
      first.state.requests[0].executedEscalationActions
    );
    expect(pending?.action).toBe("reminder_due");
  });
});

describe("acceptance 88 — conflict", () => {
  it("blocks readiness and downstream sync until resolved", () => {
    const opened = applyCommand(
      withSupplier(),
      { type: "OPEN_REQUIREMENT", requirement: requirement(), declaredSupplierId: "supplier-a" },
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
    const resolution = conflicted.state.cases[0];
    expect(resolution.state).toBe("CONFLICT");
    expect(caseReadiness(conflicted.state, resolution.id).ready).toBe(false);
    expect(resolution.downstreamSyncBlocked).toBe(true);
    expect(conflicted.state.claims[0].ready).toBe(false);
  });
});

describe("acceptance 89 — confidential upstream", () => {
  it("hides upstream identity from the manufacturer", () => {
    const opened = applyCommand(
      withSupplier(),
      { type: "OPEN_REQUIREMENT", requirement: requirement(), declaredSupplierId: "supplier-a" },
      NOW
    );
    const forwarded = applyCommand(
      opened.state,
      {
        type: "FORWARD_UPSTREAM",
        caseId: opened.caseId!,
        upstream: { id: "mill-b", name: "Mill B", legalName: "Mill B Oy", country: "Finland" },
        mode: "confidential",
      },
      NOW
    );
    const mill = forwarded.state.actors.find((a) => a.id === "mill-b")!;
    expect(manufacturerMaySeeActor(forwarded.state, mill)).toBe(false);
    expect(forwarded.state.cases[0].blockingReason).toBe("CONFIDENTIAL");
    expect(forwarded.state.relationships[0].hideCustomer).toBe(true);
  });
});

describe("acceptance 90 — permission revoked", () => {
  it("blocks reuse, flags downstream, and keeps audit history", () => {
    const opened = applyCommand(
      withSupplier(),
      { type: "OPEN_REQUIREMENT", requirement: requirement(), declaredSupplierId: "supplier-a" },
      NOW
    );
    const ready = applyCommand(
      opened.state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: opened.caseId!,
        value: "67",
        evidence: { filename: "cert.pdf" },
        permission: "GRANTED",
      },
      NOW
    );
    const claimId = ready.state.claims[0].id;
    const priorEvents = ready.state.events.length;
    const revoked = applyCommand(ready.state, { type: "REVOKE_PERMISSION", claimId }, NOW);
    expect(revoked.state.claims[0].ready).toBe(false);
    expect(revoked.state.permissions[0].state).toBe("REVOKED");
    expect(revoked.state.dependencies[0].status).toBe("flagged");
    expect(revoked.state.events.length).toBeGreaterThan(priorEvents);
    expect(revoked.state.events.some((e) => e.type === "case.ready")).toBe(true);
    expect(revoked.state.events.some((e) => e.type === "permission.revoked")).toBe(true);
  });
});

describe("acceptance 91 — expired evidence", () => {
  it("reevaluates claims and opens renewal when evidenced trust is required", () => {
    const opened = applyCommand(
      withSupplier(),
      { type: "OPEN_REQUIREMENT", requirement: requirement(), declaredSupplierId: "supplier-a" },
      NOW
    );
    const ready = applyCommand(
      opened.state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: opened.caseId!,
        value: "67",
        evidence: { filename: "cert.pdf" },
        permission: "GRANTED",
      },
      NOW
    );
    const expired = applyCommand(ready.state, { type: "EXPIRE_EVIDENCE", evidenceId: ready.state.evidence[0].id }, NOW);
    expect(expired.state.evidence[0].expired).toBe(true);
    expect(expired.state.claims[0].ready).toBe(false);
    expect(expired.state.cases[0].state).toBe("RENEWAL_REQUIRED");
    expect(caseReadiness(expired.state, expired.state.cases[0].id).ready).toBe(false);
  });
});

describe("acceptance 92 — identity uncertainty", () => {
  it("does not auto-link evidence and opens an identity review task", () => {
    const state = withSupplier();
    state.actors.push({
      id: "acme-alu",
      name: "Acme Aluminium",
      legalName: "Acme Aluminium",
      kind: "organisation",
      country: "Germany",
    });
    state.actors.push({
      id: "acme-alu-gmbh",
      name: "Acme Aluminium GmbH",
      legalName: "Acme Aluminium GmbH",
      kind: "organisation",
      vat: "DE811128135",
      country: "Germany",
    });
    const identity = resolveIdentity({ name: "Acme Aluminium", country: "Germany" }, state.actors, 95);
    expect(identity.status).toBe("IDENTITY_AMBIGUOUS");
    expect(identity.autoLinkAllowed).toBe(false);
    expect(mayAutoLinkEvidence(91, 95, true)).toBe(false);

    const opened = applyCommand(
      state,
      {
        type: "OPEN_REQUIREMENT",
        requirement: requirement("req-id"),
        identityQuery: { name: "Acme Aluminium", country: "Germany" },
      },
      NOW
    );
    expect(opened.state.cases[0].state).toBe("IDENTITY_REVIEW");
    expect(opened.state.tasks.some((t) => t.kind === "identity")).toBe(true);
    expect(opened.state.requests).toHaveLength(0);
  });
});

describe("acceptance 93 — duplicate request", () => {
  it("links a second dataset trigger to the existing case", () => {
    const first = applyCommand(
      withSupplier(),
      { type: "OPEN_REQUIREMENT", requirement: requirement("req-a"), declaredSupplierId: "supplier-a" },
      NOW
    );
    const second = applyCommand(
      first.state,
      {
        type: "OPEN_REQUIREMENT",
        requirement: { ...requirement("req-b"), datasetId: "customer-dpp" },
        declaredSupplierId: "supplier-a",
      },
      NOW
    );
    expect(second.caseId).toBe(first.caseId);
    expect(second.state.cases).toHaveLength(1);
    expect(second.state.requests).toHaveLength(1);
    expect(second.state.requirements.find((r) => r.id === "req-b")?.linkedCaseId).toBe(first.caseId);
    expect(
      findActiveDuplicate({
        requirements: second.state.requirements,
        subjectId: "AL-FRAME-881",
        propertyId: "recycled_content",
        actorId: "supplier-a",
        cases: second.state.cases,
      })?.caseId
    ).toBe(first.caseId);
  });
});

describe("cycle detection", () => {
  it("does not send a new request when the chain loops", () => {
    const opened = applyCommand(
      withSupplier(),
      { type: "OPEN_REQUIREMENT", requirement: requirement(), declaredSupplierId: "supplier-a" },
      NOW
    );
    opened.state.actors.push({
      id: "mill",
      name: "Mill",
      legalName: "Mill",
      kind: "organisation",
      country: "FI",
    });
    opened.state.relationships.push({
      id: "rel-loop",
      fromActorId: "mill",
      toActorId: "supplier-a",
      confidentialUpstream: false,
      confidentialDownstream: false,
      hideCustomer: false,
    });
    expect(wouldCreateCycle(opened.state.relationships, "supplier-a", "mill")).toBe(true);
    const cycled = applyCommand(
      opened.state,
      {
        type: "FORWARD_UPSTREAM",
        caseId: opened.caseId!,
        upstream: { id: "mill", name: "Mill", legalName: "Mill", country: "FI" },
        mode: "on_behalf",
      },
      NOW
    );
    expect(cycled.state.cases[0].blockingReason).toBe("CHAIN_CYCLE");
    expect(cycled.state.attempts.filter((a) => a.method === "upstream_request")).toHaveLength(0);
  });
});
