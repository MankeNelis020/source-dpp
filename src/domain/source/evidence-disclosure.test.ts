import { afterEach, describe, expect, it } from "vitest";
import { applyCommand, emptyState, EngineValidationError } from "./engine";
import {
  activateDataDisclosureTermsForTests,
  currentDataDisclosureTerms,
  DATA_DISCLOSURE_TERMS_V1_DRAFT,
  hashDisclosureTermsText,
  resetDataDisclosureTermsForTests,
  type DataDisclosureTerms,
} from "./disclosure-terms";
import { classifyEvidenceStrength, TRUST_STRENGTH_LABEL } from "./evidence-policy";
import { evaluateReuse } from "./reuse";
import type { InformationRequirement } from "./types";

const NOW = new Date("2026-08-19T09:00:00.000Z");

function requirement(id = "req-1", extra?: Partial<InformationRequirement>): InformationRequirement {
  return {
    id,
    tenantId: "acme",
    subjectId: extra?.subjectId ?? "AL-FRAME-881",
    subjectLabel: extra?.subjectLabel ?? "Aluminium Frame",
    productIds: extra?.productIds ?? ["urban-chair-04"],
    propertyId: extra?.propertyId ?? "recycled_content",
    propertyLabel: extra?.propertyLabel ?? "Recycled content",
    datasetId: "espr-al-2027",
    purpose: "DPP_COMPLIANCE",
    requiredTrustLevel: extra?.requiredTrustLevel ?? "EVIDENCED",
    requiredPermissionLevel: extra?.requiredPermissionLevel ?? "granted",
    requiredBy: "2027-02-01",
    priority: 90,
    createdAt: NOW.toISOString(),
    ...extra,
  };
}

function withSupplier() {
  const state = emptyState();
  state.actors.push({
    id: "supplier-a",
    name: "Northwood Components",
    legalName: "Northwood Components GmbH",
    kind: "organisation",
    vat: "DE813334455",
    country: "Germany",
  });
  state.contacts.push({
    id: "ct-a",
    actorId: "supplier-a",
    role: "product_data",
    name: "Lena",
    email: "data@northwood.example",
    valid: true,
  });
  return state;
}

function open(req?: InformationRequirement) {
  return applyCommand(
    withSupplier(),
    { type: "OPEN_REQUIREMENT", requirement: req ?? requirement(), declaredSupplierId: "supplier-a" },
    NOW
  );
}

function accept(state: ReturnType<typeof emptyState>, caseId: string, extra?: { authorityConfirmed?: boolean; termsAccepted?: boolean; grantId?: string }) {
  const terms = currentDataDisclosureTerms();
  return applyCommand(
    state,
    {
      type: "ACCEPT_EVIDENCE_DISCLOSURE",
      caseId,
      authorityConfirmed: extra?.authorityConfirmed ?? true,
      termsAccepted: extra?.termsAccepted ?? true,
      agreementId: terms.agreementId,
      agreementVersion: terms.version,
      portalGrantId: extra?.grantId ?? "grant-1",
      reusePolicy: "NO_REUSE",
      acceptedBy: "supplier-a",
    },
    NOW
  );
}

afterEach(() => {
  resetDataDisclosureTermsForTests();
});

describe("SOURCE evidence & disclosure V1 — terms versions", () => {
  it("publishes reuse transparency on a new current version without mutating v1", () => {
    const current = currentDataDisclosureTerms();
    expect(current.version).toBe("v1.1-draft-legal-review");
    expect(current.legalReviewStatus).toBe("REQUIRES_LEGAL_REVIEW");
    expect(current.reuseSummary).toMatch(/Identifying evidence as potentially relevant does not automatically authorise/i);
    expect(current.sections.some((section) => section.heading === "Evidence reuse")).toBe(true);
    expect(DATA_DISCLOSURE_TERMS_V1_DRAFT.version).toBe("v1-draft-legal-review");
    expect(DATA_DISCLOSURE_TERMS_V1_DRAFT.hash).not.toBe(current.hash);
  });
});

describe("SOURCE evidence & disclosure V1 — acceptances", () => {
  it("cannot submit evidence without authority confirmation", () => {
    const opened = open();
    expect(() =>
      accept(opened.state, opened.caseId!, { authorityConfirmed: false })
    ).toThrow(EngineValidationError);
  });

  it("cannot submit evidence without Data Disclosure Terms acceptance", () => {
    const opened = open();
    expect(() => accept(opened.state, opened.caseId!, { termsAccepted: false })).toThrow(/Data Disclosure Terms/);
    const accepted = accept(opened.state, opened.caseId!);
    expect(() =>
      applyCommand(
        opened.state,
        {
          type: "SUBMIT_RESPONSE",
          caseId: opened.caseId!,
          value: "67",
          permission: "GRANTED",
          evidenceRoute: "ORIGINAL_DOCUMENT",
          disclosureMode: "SHARE_SOURCE",
          evidence: { filename: "cert.pdf" },
          portalGrantId: "grant-1",
        },
        NOW
      )
    ).toThrow(/authorisation/i);
    expect(accepted.state.disclosureAcceptances[0].agreementVersion).toBe(currentDataDisclosureTerms().version);
  });

  it("stores agreement version, request scope and independent authority fields", () => {
    const opened = open();
    const accepted = accept(opened.state, opened.caseId!);
    const row = accepted.state.disclosureAcceptances[0];
    expect(row.authorityConfirmed).toBe(true);
    expect(row.termsAccepted).toBe(true);
    expect(row.authorityConfirmedAt).toBeTruthy();
    expect(row.acceptedAt).toBeTruthy();
    expect(row.agreementVersion).toBe(currentDataDisclosureTerms().version);
    expect(row.requestingOrganisationId).toBe("acme");
    expect(row.scopeCaseIds).toContain(opened.caseId);
    expect(row.termsHash).toBe(currentDataDisclosureTerms().hash);
    expect(accepted.events.some((e) => e.type === "authority.confirmed")).toBe(true);
    expect(accepted.events.some((e) => e.type === "disclosure.terms_accepted")).toBe(true);
  });

  it("does not mutate a historical acceptance after terms update", () => {
    const opened = open();
    const accepted = accept(opened.state, opened.caseId!);
    const first = accepted.state.disclosureAcceptances[0];
    const replay = accept(accepted.state, opened.caseId!);
    expect(replay.state.disclosureAcceptances).toHaveLength(1);
    expect(replay.state.disclosureAcceptances[0].createdAt).toBe(first.createdAt);

    const submitted = applyCommand(
      replay.state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: opened.caseId!,
        value: "67",
        permission: "GRANTED",
        evidenceRoute: "ORIGINAL_DOCUMENT",
        disclosureMode: "PROTECTED_SOURCE",
        evidence: { filename: "cert.pdf", storageObjectId: "obj-1" },
        portalGrantId: "grant-1",
      },
      NOW
    );
    expect(submitted.state.evidence[0].agreementVersion).toBe(first.agreementVersion);

    const nextTerms: DataDisclosureTerms = {
      ...currentDataDisclosureTerms(),
      version: "v2-draft-legal-review",
      hash: hashDisclosureTermsText("v2-body"),
      fullText: "v2-body",
    };
    activateDataDisclosureTermsForTests(nextTerms);
    expect(() =>
      applyCommand(
        submitted.state,
        {
          type: "SUBMIT_RESPONSE",
          caseId: opened.caseId!,
          value: "68",
          permission: "GRANTED",
          evidenceRoute: "ALTERNATIVE_DOCUMENT",
          disclosureMode: "SHARE_SOURCE",
          evidence: { filename: "other.pdf", storageObjectId: "obj-2" },
          portalGrantId: "grant-1",
        },
        NOW
      )
    ).toThrow(/updated/i);
    expect(submitted.state.evidence[0].agreementVersion).toBe(first.agreementVersion);
    expect(submitted.state.disclosureAcceptances[0].agreementVersion).toBe(first.agreementVersion);
  });

  it("does not store a foreign organisation as the requesting organisation", () => {
    const opened = open();
    const accepted = accept(opened.state, opened.caseId!);
    expect(accepted.state.disclosureAcceptances[0].requestingOrganisationId).toBe(opened.state.tenant.id);
    expect(accepted.state.disclosureAcceptances[0].requestingOrganisationId).not.toBe("forged-org");
  });
});

describe("SOURCE evidence & disclosure V1 — routes", () => {
  it("records original, alternative, attestation and cannot-provide as distinct routes", () => {
    const opened = open();
    const accepted = accept(opened.state, opened.caseId!);

    const original = applyCommand(
      accepted.state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: opened.caseId!,
        value: "67",
        permission: "GRANTED",
        evidenceRoute: "ORIGINAL_DOCUMENT",
        disclosureMode: "SHARE_SOURCE",
        evidence: { filename: "fsc.pdf", storageObjectId: "obj-orig" },
        portalGrantId: "grant-1",
      },
      NOW
    );
    expect(original.state.evidence[0].route).toBe("ORIGINAL_DOCUMENT");
    expect(original.state.claims[0].trustLevel).toBe("EVIDENCED");

    const openedAlt = open(requirement("req-alt"));
    const acceptedAlt = accept(openedAlt.state, openedAlt.caseId!, { grantId: "grant-alt" });
    const alternative = applyCommand(
      acceptedAlt.state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: openedAlt.caseId!,
        value: "67",
        permission: "GRANTED",
        evidenceRoute: "ALTERNATIVE_DOCUMENT",
        disclosureMode: "SHARE_SOURCE",
        evidence: { filename: "third-party.pdf", storageObjectId: "obj-alt" },
        portalGrantId: "grant-alt",
      },
      NOW
    );
    expect(alternative.state.evidence[0].route).toBe("ALTERNATIVE_DOCUMENT");

    const openedAtt = open(requirement("req-att"));
    const acceptedAtt = accept(openedAtt.state, openedAtt.caseId!, { grantId: "grant-att" });
    const attestation = applyCommand(
      acceptedAtt.state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: openedAtt.caseId!,
        value: "We confirm recycled content is 67%.",
        permission: "GRANTED",
        evidenceRoute: "SUPPLIER_ATTESTATION",
        disclosureMode: "SHARE_SOURCE",
        portalGrantId: "grant-att",
        attestation: {
          legalEntity: "Northwood Components GmbH",
          personName: "Lena Weiss",
          role: "Product data steward",
          statement: "We confirm recycled content is 67%.",
          productIds: ["urban-chair-04"],
          requirementIds: ["req-att"],
        },
      },
      NOW
    );
    expect(attestation.state.evidence[0].route).toBe("SUPPLIER_ATTESTATION");
    expect(attestation.state.claims[0].trustLevel).toBe("DECLARED");
    expect(attestation.state.cases[0].state).not.toBe("READY");
    expect(attestation.state.requirementAssessments[0].result).toBe("INSUFFICIENT");
    expect(attestation.state.requirementAssessments[0].reason).toMatch(/documentary evidence is still required/i);

    const openedNo = open(requirement("req-no"));
    const acceptedNo = accept(openedNo.state, openedNo.caseId!, { grantId: "grant-no" });
    const cannot = applyCommand(
      acceptedNo.state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: openedNo.caseId!,
        value: "",
        permission: "DENIED",
        evidenceRoute: "CANNOT_PROVIDE",
        disclosureMode: "CANNOT_DISCLOSE",
        cannotProvideReason: "commercially_sensitive",
        portalGrantId: "grant-no",
      },
      NOW
    );
    expect(cannot.state.cases[0].state).not.toBe("READY");
    expect(cannot.state.cannotProvideResponses[0].reason).toBe("commercially_sensitive");
    expect(cannot.state.requirementAssessments[0].result).toBe("INSUFFICIENT");
  });

  it("lets the same evidence support multiple same-property requirements", () => {
    const first = open(requirement("req-p1", { productIds: ["SRC-001"], subjectId: "SRC-001", subjectLabel: "SRC-001" }));
    const secondReq = requirement("req-p2", {
      productIds: ["SRC-002"],
      subjectId: "SRC-002",
      subjectLabel: "SRC-002",
    });
    const withSecond = applyCommand(
      first.state,
      { type: "OPEN_REQUIREMENT", requirement: secondReq, declaredSupplierId: "supplier-a" },
      NOW
    );
    const caseA = first.caseId!;
    const caseB = withSecond.caseId!;
    const accepted = accept(withSecond.state, caseA);
    const submitted = applyCommand(
      accepted.state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: caseA,
        value: "67",
        permission: "GRANTED",
        evidenceRoute: "ORIGINAL_DOCUMENT",
        disclosureMode: "PROTECTED_SOURCE",
        evidence: {
          filename: "batch.pdf",
          storageObjectId: "obj-shared",
        },
        supportsCaseIds: [caseB],
        portalGrantId: "grant-1",
      },
      NOW
    );
    expect(submitted.state.evidence).toHaveLength(1);
    expect(submitted.state.claims).toHaveLength(2);
    expect(submitted.state.evidence[0].linkedClaimIds).toHaveLength(2);
  });

  it("is idempotent when the same storage object is submitted again", () => {
    const opened = open();
    const accepted = accept(opened.state, opened.caseId!);
    const command = {
      type: "SUBMIT_RESPONSE" as const,
      caseId: opened.caseId!,
      value: "67",
      permission: "GRANTED" as const,
      evidenceRoute: "ORIGINAL_DOCUMENT" as const,
      disclosureMode: "SHARE_SOURCE" as const,
      evidence: { filename: "cert.pdf", storageObjectId: "obj-idem" },
      portalGrantId: "grant-1",
    };
    const first = applyCommand(accepted.state, command, NOW);
    const second = applyCommand(first.state, command, NOW);
    expect(second.state.evidence).toHaveLength(1);
    expect(second.state.claims.filter((c) => c.caseId === opened.caseId)).toHaveLength(1);
  });
});

describe("SOURCE evidence & disclosure V1 — strength and sufficiency", () => {
  it("does not let a supplier self-award VERIFIED or TRACEABLE", () => {
    const opened = open();
    const accepted = accept(opened.state, opened.caseId!);
    const submitted = applyCommand(
      accepted.state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: opened.caseId!,
        value: "67",
        permission: "GRANTED",
        evidenceRoute: "ORIGINAL_DOCUMENT",
        disclosureMode: "SHARE_SOURCE",
        evidence: { filename: "anything.pdf", storageObjectId: "obj-pdf" },
        portalGrantId: "grant-1",
      },
      NOW
    );
    expect(submitted.state.claims[0].trustLevel).toBe("EVIDENCED");
    expect(submitted.state.claims[0].trustLevel).not.toBe("VERIFIED");
    expect(TRUST_STRENGTH_LABEL.EVIDENCED).toBe("Documented");
  });

  it("classifies independent documentary evidence as VERIFIED only when SOURCE sets issuer class", () => {
    const opened = open();
    const accepted = accept(opened.state, opened.caseId!);
    const submitted = applyCommand(
      accepted.state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: opened.caseId!,
        value: "67",
        permission: "GRANTED",
        evidenceRoute: "ALTERNATIVE_DOCUMENT",
        disclosureMode: "SHARE_SOURCE",
        evidence: { filename: "lab.pdf", storageObjectId: "obj-lab" },
        issuerClass: "laboratory",
        portalGrantId: "grant-1",
      },
      NOW
    );
    expect(submitted.state.claims[0].trustLevel).toBe("VERIFIED");
  });

  it("classifies AUTHORITATIVE only for official or competent sources", () => {
    expect(classifyEvidenceStrength({ route: "ORIGINAL_DOCUMENT", hasFile: true, issuerClass: "official_registry" }).trustLevel).toBe(
      "TRACEABLE"
    );
    expect(classifyEvidenceStrength({ route: "ORIGINAL_DOCUMENT", hasFile: true }).trustLevel).toBe("EVIDENCED");
    expect(classifyEvidenceStrength({ route: "SUPPLIER_ATTESTATION", hasFile: false }).trustLevel).toBe("DECLARED");
  });

  it("does not raise strength merely because a PDF filename exists", () => {
    const opened = open();
    const accepted = accept(opened.state, opened.caseId!);
    const submitted = applyCommand(
      accepted.state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: opened.caseId!,
        value: "",
        permission: "GRANTED",
        evidenceRoute: "ORIGINAL_DOCUMENT",
        disclosureMode: "SHARE_SOURCE",
        evidence: { filename: "unrelated.pdf" },
        portalGrantId: "grant-1",
      },
      NOW
    );
    expect(submitted.state.claims[0].trustLevel).toBe("DECLARED");
    expect(submitted.state.cases[0].state).not.toBe("READY");
  });

  it("treats strong but out-of-scope evidence as insufficient", () => {
    const opened = open();
    const accepted = accept(opened.state, opened.caseId!);
    const submitted = applyCommand(
      accepted.state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: opened.caseId!,
        value: "67",
        permission: "GRANTED",
        evidenceRoute: "ORIGINAL_DOCUMENT",
        disclosureMode: "SHARE_SOURCE",
        evidence: {
          filename: "other-plant.pdf",
          storageObjectId: "obj-scope",
          scope: { kind: "product", id: "OTHER-PRODUCT", label: "Other" },
        },
        issuerClass: "laboratory",
        portalGrantId: "grant-1",
      },
      NOW
    );
    expect(submitted.state.cases[0].state).toBe("VALIDATING");
    expect(submitted.state.requirementAssessments[0].result).toBe("INSUFFICIENT");
    expect(submitted.state.cases[0].state).not.toBe("READY");
  });

  it("allows weak evidence when the requirement policy only needs DECLARED trust", () => {
    const opened = open(requirement("req-decl", { requiredTrustLevel: "DECLARED" }));
    const accepted = accept(opened.state, opened.caseId!);
    const submitted = applyCommand(
      accepted.state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: opened.caseId!,
        value: "EU origin",
        permission: "GRANTED",
        evidenceRoute: "SUPPLIER_ATTESTATION",
        disclosureMode: "SHARE_SOURCE",
        portalGrantId: "grant-1",
        attestation: {
          legalEntity: "Northwood Components GmbH",
          personName: "Lena Weiss",
          role: "Compliance",
          statement: "EU origin",
          productIds: ["urban-chair-04"],
          requirementIds: ["req-decl"],
        },
      },
      NOW
    );
    expect(submitted.state.claims[0].trustLevel).toBe("DECLARED");
    expect(submitted.state.cases[0].state).toBe("READY");
    expect(submitted.state.requirementAssessments[0].result).toBe("SUFFICIENT");
  });

  it("records conflicting evidence as CONFLICTING and keeps the requirement unresolved", () => {
    const opened = open();
    const accepted = accept(opened.state, opened.caseId!);
    const submitted = applyCommand(
      accepted.state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: opened.caseId!,
        value: "67",
        permission: "GRANTED",
        evidenceRoute: "ORIGINAL_DOCUMENT",
        disclosureMode: "SHARE_SOURCE",
        evidence: { filename: "epd.pdf", extractedValue: "42", storageObjectId: "obj-cf" },
        portalGrantId: "grant-1",
      },
      NOW
    );
    expect(submitted.state.cases[0].state).toBe("CONFLICT");
    expect(submitted.state.requirementAssessments[0].result).toBe("CONFLICTING");
    expect(submitted.state.claims[0].ready).toBe(false);
  });
});

describe("SOURCE evidence & disclosure V1 — reuse", () => {
  it("does not reuse evidence marked NO_REUSE", () => {
    const opened = open();
    const accepted = accept(opened.state, opened.caseId!);
    const submitted = applyCommand(
      accepted.state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: opened.caseId!,
        value: "67",
        permission: "GRANTED",
        evidenceRoute: "ORIGINAL_DOCUMENT",
        disclosureMode: "SHARE_SOURCE",
        reusePolicy: "NO_REUSE",
        evidence: { filename: "cert.pdf", storageObjectId: "obj-reuse" },
        portalGrantId: "grant-1",
      },
      NOW
    );
    const outcome = evaluateReuse({
      requirement: requirement(),
      identityMatched: true,
      claim: submitted.state.claims[0],
      evidence: submitted.state.evidence[0],
      permission: submitted.state.permissions[0],
      now: NOW,
    });
    expect(submitted.state.evidence[0].reusePolicy).toBe("NO_REUSE");
    expect(outcome).toBe("NONE");
  });

  it("keeps organisation-scoped reuse inside the requesting organisation grant", () => {
    const opened = open();
    const accepted = applyCommand(
      opened.state,
      {
        type: "ACCEPT_EVIDENCE_DISCLOSURE",
        caseId: opened.caseId!,
        authorityConfirmed: true,
        termsAccepted: true,
        agreementId: currentDataDisclosureTerms().agreementId,
        agreementVersion: currentDataDisclosureTerms().version,
        portalGrantId: "grant-1",
        reusePolicy: "REUSE_WITHIN_REQUESTING_ORGANISATION",
      },
      NOW
    );
    const submitted = applyCommand(
      accepted.state,
      {
        type: "SUBMIT_RESPONSE",
        caseId: opened.caseId!,
        value: "67",
        permission: "GRANTED",
        evidenceRoute: "ORIGINAL_DOCUMENT",
        disclosureMode: "SHARE_SOURCE",
        reusePolicy: "REUSE_WITHIN_REQUESTING_ORGANISATION",
        evidence: { filename: "cert.pdf", storageObjectId: "obj-org" },
        portalGrantId: "grant-1",
      },
      NOW
    );
    expect(submitted.state.permissions[0].granteeActorId).toBe("acme");
    expect(evaluateReuse({
      requirement: requirement(),
      identityMatched: true,
      claim: submitted.state.claims[0],
      evidence: submitted.state.evidence[0],
      permission: submitted.state.permissions[0],
      now: NOW,
    })).toBe("READY");
  });

  it("does not allow reuse broader than the accepted policy", () => {
    const opened = open();
    const accepted = accept(opened.state, opened.caseId!);
    expect(() =>
      applyCommand(
        accepted.state,
        {
          type: "SUBMIT_RESPONSE",
          caseId: opened.caseId!,
          value: "67",
          permission: "GRANTED",
          evidenceRoute: "ORIGINAL_DOCUMENT",
          disclosureMode: "SHARE_SOURCE",
          reusePolicy: "BROADER_REUSE",
          evidence: { filename: "cert.pdf", storageObjectId: "obj-broad" },
          portalGrantId: "grant-1",
        },
        NOW
      )
    ).toThrow(/Reuse cannot exceed/);
  });
});
