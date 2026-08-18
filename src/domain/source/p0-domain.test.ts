import { describe, expect, it } from "vitest";
import { applyCommand, emptyState } from "@/domain/source/engine";
import { evaluatePermission } from "@/domain/source/permissions";
import { evaluateReuse } from "@/domain/source/reuse";
import { IDENTITY_ENGINE_VERSION, IDENTITY_SCORES_ARE_CALIBRATED, resolveIdentity } from "@/domain/source/identity";
import { planResolution } from "@/domain/source/planner";
import { evaluatePropagationCandidate, tenantSafePropagationCopy } from "@/domain/source/propagation";
import { caseReadiness } from "@/domain/source/engine";
import type { InformationRequirement } from "@/domain/source/types";

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

describe("permission evaluation", () => {
  it("does not treat RESTRICTED as an automatic pass", () => {
    expect(
      evaluatePermission({
        storedState: "RESTRICTED",
        visibility: "restricted",
        permissionRequired: true,
        requestingOrganisationId: "acme",
        granteeActorId: "acme",
        purpose: "DPP_COMPLIANCE",
        now: NOW,
      })
    ).toBe("AUTHORIZATION_REQUIRED");
  });

  it("allows an explicit grant for the requesting organisation", () => {
    expect(
      evaluatePermission({
        storedState: "GRANTED",
        visibility: "VALUE_ONLY",
        permissionRequired: true,
        requestingOrganisationId: "acme",
        granteeActorId: "acme",
        purpose: "DPP_COMPLIANCE",
        grantPurpose: "DPP_COMPLIANCE",
        now: NOW,
      })
    ).toBe("ALLOW");
  });

  it("denies revoked and expired grants", () => {
    expect(
      evaluatePermission({
        storedState: "REVOKED",
        permissionRequired: true,
        requestingOrganisationId: "acme",
        purpose: "DPP_COMPLIANCE",
        now: NOW,
        revokedAt: NOW.toISOString(),
      })
    ).toBe("DENY");
  });
});

describe("reuse of RESTRICTED", () => {
  it("requires authorization instead of becoming READY", () => {
    const outcome = evaluateReuse({
      requirement: requirement(),
      identityMatched: true,
      claim: {
        id: "cl-1",
        propertyId: "recycled_content",
        value: "67",
        subjectId: "AL-FRAME-881",
        productId: "urban-chair-04",
        declaredByActorId: "supplier-a",
        trustLevel: "EVIDENCED",
        permissionState: "RESTRICTED",
        purpose: "DPP_COMPLIANCE",
        identityConfidence: 99,
        ready: false,
      },
      permission: {
        id: "p1",
        claimId: "cl-1",
        granteeActorId: "acme",
        purpose: "DPP_COMPLIANCE",
        state: "RESTRICTED",
        visibility: "restricted",
        createdAt: NOW.toISOString(),
      },
      now: NOW,
    });
    expect(outcome).toBe("AUTHORIZATION_REQUIRED");
  });
});

describe("identity heuristic-v0", () => {
  it("marks scores as uncalibrated", () => {
    expect(IDENTITY_ENGINE_VERSION).toBe("heuristic-v0");
    expect(IDENTITY_SCORES_ARE_CALIBRATED).toBe(false);
    const result = resolveIdentity({ name: "Nobody" }, [], 95);
    expect(result.modelVersion).toBe("heuristic-v0");
    expect(result.scoresAreCalibrated).toBe(false);
  });
});

describe("planner v1", () => {
  it("prefers an existing trusted claim over a supplier request", () => {
    const plan = planResolution({
      requirement: requirement(),
      identityMatched: true,
      identityNeedsReview: false,
      declaredSupplierId: "supplier-a",
      claim: {
        id: "cl-1",
        propertyId: "recycled_content",
        value: "67",
        subjectId: "AL-FRAME-881",
        productId: "urban-chair-04",
        declaredByActorId: "supplier-a",
        trustLevel: "EVIDENCED",
        permissionState: "GRANTED",
        purpose: "DPP_COMPLIANCE",
        identityConfidence: 99,
        ready: true,
        evidenceId: "ev-1",
      },
      evidence: {
        id: "ev-1",
        filename: "cert.pdf",
        sha256: "ab",
        issuer: "lab",
        ownerActorId: "supplier-a",
        expired: false,
        scope: { kind: "product", id: "AL-FRAME-881", label: "frame" },
        visibility: "private",
        linkedClaimIds: ["cl-1"],
      },
      permission: {
        id: "p1",
        claimId: "cl-1",
        granteeActorId: "acme",
        purpose: "DPP_COMPLIANCE",
        state: "GRANTED",
        visibility: "value",
        createdAt: NOW.toISOString(),
      },
      hasValidContact: true,
      now: NOW,
      openCases: [],
    });
    expect(plan.strategy).toBe("exact_trusted_claim");
    expect(plan.expectedActions).toEqual(["reuse"]);
  });
});

describe("propagation privacy copy", () => {
  it("does not name the source customer", () => {
    expect(tenantSafePropagationCopy("READY")).not.toMatch(/Customer A/i);
    expect(tenantSafePropagationCopy("AUTHORIZATION_REQUIRED")).toContain("allow its use");
  });

  it("rejects the wrong subject", () => {
    const result = evaluatePropagationCandidate({
      claim: {
        id: "cl-1",
        propertyId: "recycled_content",
        value: "67",
        subjectId: "OTHER",
        productId: "x",
        declaredByActorId: "supplier-a",
        trustLevel: "EVIDENCED",
        permissionState: "GRANTED",
        purpose: "DPP_COMPLIANCE",
        identityConfidence: 99,
        ready: true,
      },
      requirement: requirement(),
      now: NOW,
      requestingOrganisationId: "acme",
    });
    expect(result).toBe("NO_MATCH");
  });
});

describe("readiness invariant after commands", () => {
  it("keeps cached ready equal to evaluated ready", () => {
    const state = emptyState();
    state.actors.push({
      id: "supplier-a",
      name: "Supplier A",
      legalName: "Supplier A GmbH",
      kind: "organisation",
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
    const opened = applyCommand(state, { type: "OPEN_REQUIREMENT", requirement: requirement(), declaredSupplierId: "supplier-a" }, NOW);
    const submitted = applyCommand(
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
    const claim = submitted.state.claims[0];
    expect(claim.ready).toBe(caseReadiness(submitted.state, submitted.state.cases[0].id).ready);
  });
});

describe("manual subject provenance", () => {
  it("records USER_ADDED and does not mark the row as AI_EXTRACTED", () => {
    const state = emptyState();
    state.subjects.push({
      id: "urban-chair-04",
      kind: "PRODUCT",
      name: "Urban Chair",
      createdAt: NOW.toISOString(),
      source: "IMPORTED",
    });
    const result = applyCommand(
      state,
      {
        type: "ADD_SUBJECT",
        kind: "MATERIAL",
        name: "Stainless Steel 304",
        parentSubjectId: "urban-chair-04",
        source: "USER_ADDED",
        createdBy: "user-acme-owner",
        generateRequirements: true,
      },
      NOW
    );
    const material = result.state.subjects.find((s) => s.name === "Stainless Steel 304");
    expect(material?.source).toBe("USER_ADDED");
    expect(material?.source).not.toBe("AI_EXTRACTED");
    expect(result.state.requirements.length).toBeGreaterThan(0);
  });
});
