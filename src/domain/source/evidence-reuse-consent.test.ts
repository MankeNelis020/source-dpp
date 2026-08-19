import { afterEach, describe, expect, it } from "vitest";
import { applyCommand, emptyState, EngineValidationError } from "./engine";
import {
  currentDataDisclosureTerms,
  DATA_DISCLOSURE_TERMS_V1_DRAFT,
  resetDataDisclosureTermsForTests,
} from "./disclosure-terms";
import { defaultEvidenceReusePolicy, isSupportedReusePolicy } from "./evidence-policy";
import { SUPPLIER_REUSE_CHOICES } from "./copy";
import { discoverReusableEvidence, effectiveReusePolicy } from "./reuse-consent";
import type { DisclosureMode, EvidenceReusePolicy, EvidenceScope, InformationRequirement } from "./types";

const NOW = new Date("2026-08-19T09:00:00.000Z");

function fscRequirement(id: string, subjectId: string, label: string, extra?: Partial<InformationRequirement>): InformationRequirement {
  return {
    id,
    tenantId: "acme",
    subjectId,
    subjectLabel: label,
    productIds: extra?.productIds ?? [subjectId],
    propertyId: extra?.propertyId ?? "fsc_certification",
    propertyLabel: extra?.propertyLabel ?? "FSC certification",
    datasetId: "espr-wood-2027",
    purpose: extra?.purpose ?? "DPP_COMPLIANCE",
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
  state.actors.push({
    id: "supplier-b",
    name: "Other Mill",
    legalName: "Other Mill BV",
    kind: "organisation",
    country: "Netherlands",
  });
  state.contacts.push({
    id: "ct-a",
    actorId: "supplier-a",
    role: "product_data",
    name: "Lena",
    email: "data@northwood.example",
    valid: true,
  });
  state.subjects.push({
    id: "oak-table",
    name: "Oak Table",
    kind: "PRODUCT",
    createdAt: NOW.toISOString(),
    source: "IMPORTED",
  });
  state.subjects.push({
    id: "oak-chair",
    name: "Oak Chair",
    kind: "PRODUCT",
    createdAt: NOW.toISOString(),
    source: "IMPORTED",
  });
  state.subjects.push({
    id: "oak-cabinet",
    name: "Oak Cabinet",
    kind: "PRODUCT",
    createdAt: NOW.toISOString(),
    source: "IMPORTED",
  });
  return state;
}

function open(req: InformationRequirement, state = withSupplier()) {
  return applyCommand(state, { type: "OPEN_REQUIREMENT", requirement: req, declaredSupplierId: "supplier-a" }, NOW);
}

function accept(state: ReturnType<typeof emptyState>, caseId: string, reusePolicy: EvidenceReusePolicy = "REUSE_WITHIN_REQUESTING_ORGANISATION") {
  const terms = currentDataDisclosureTerms();
  return applyCommand(
    state,
    {
      type: "ACCEPT_EVIDENCE_DISCLOSURE",
      caseId,
      authorityConfirmed: true,
      termsAccepted: true,
      agreementId: terms.agreementId,
      agreementVersion: terms.version,
      portalGrantId: "grant-1",
      reusePolicy,
      acceptedBy: "supplier-a",
    },
    NOW
  );
}

function submitCert(
  state: ReturnType<typeof emptyState>,
  caseId: string,
  extra?: {
    reusePolicy?: EvidenceReusePolicy;
    disclosureMode?: DisclosureMode;
    scope?: EvidenceScope;
    filename?: string;
    value?: string;
    extractedValue?: string;
    storageObjectId?: string;
  }
) {
  const value = extra?.value ?? "FSC Mix Credit";
  return applyCommand(
    state,
    {
      type: "SUBMIT_RESPONSE",
      caseId,
      value,
      permission: "GRANTED",
      evidenceRoute: "ORIGINAL_DOCUMENT",
      disclosureMode: extra?.disclosureMode ?? "PROTECTED_SOURCE",
      reusePolicy: extra?.reusePolicy,
      evidence: {
        filename: extra?.filename ?? "FSC-Certificate-2026.pdf",
        extractedValue: extra?.extractedValue ?? value,
        confidence: 99,
        storageObjectId: extra?.storageObjectId ?? `obj-${caseId}`,
        scope: extra?.scope ?? { kind: "product", id: "oak-table", label: "Oak Table" },
      },
      portalGrantId: "grant-1",
    },
    NOW
  );
}

afterEach(() => {
  resetDataDisclosureTermsForTests();
});

describe("ASK_FOR_REUSE policy", () => {
  it("supports ASK_FOR_REUSE and the supplier-facing choices omit broader reuse", () => {
    expect(isSupportedReusePolicy("ASK_FOR_REUSE")).toBe(true);
    expect(SUPPLIER_REUSE_CHOICES.map((item) => item.id)).toEqual([
      "ASK_FOR_REUSE",
      "REUSE_WITHIN_REQUESTING_ORGANISATION",
      "NO_REUSE",
    ]);
    expect(defaultEvidenceReusePolicy("REUSE_WITHIN_REQUESTING_ORGANISATION")).toBe("ASK_FOR_REUSE");
    expect(defaultEvidenceReusePolicy("NO_REUSE")).toBe("NO_REUSE");
  });

  it("stores ASK_FOR_REUSE for new portal submissions when omitted under a same-org terms ceiling", () => {
    const opened = open(fscRequirement("req-a", "oak-table", "Oak Table"));
    const accepted = accept(opened.state, opened.caseId!);
    const submitted = submitCert(accepted.state, opened.caseId!);
    expect(submitted.state.evidence[0].reusePolicy).toBe("ASK_FOR_REUSE");
    expect(submitted.state.cases[0].state).toBe("READY");
  });

  it("rejects an unsupported reuse policy", () => {
    const opened = open(fscRequirement("req-a", "oak-table", "Oak Table"));
    const accepted = accept(opened.state, opened.caseId!);
    expect(() =>
      applyCommand(
        accepted.state,
        {
          type: "SUBMIT_RESPONSE",
          caseId: opened.caseId!,
          value: "FSC Mix Credit",
          permission: "GRANTED",
          evidenceRoute: "ORIGINAL_DOCUMENT",
          disclosureMode: "PROTECTED_SOURCE",
          reusePolicy: "SILENT_MARKETPLACE" as EvidenceReusePolicy,
          evidence: { filename: "cert.pdf", storageObjectId: "obj-bad" },
          portalGrantId: "grant-1",
        },
        NOW
      )
    ).toThrow(EngineValidationError);
  });

  it("cannot submit a reuse policy above the accepted terms ceiling", () => {
    const opened = open(fscRequirement("req-a", "oak-table", "Oak Table"));
    const accepted = accept(opened.state, opened.caseId!, "ASK_FOR_REUSE");
    expect(() =>
      submitCert(accepted.state, opened.caseId!, { reusePolicy: "REUSE_WITHIN_REQUESTING_ORGANISATION" })
    ).toThrow(/Reuse cannot exceed/);
  });
});

describe("legacy evidence fail-closed", () => {
  it("treats missing reusePolicy as NO_REUSE for cross-product discovery", () => {
    expect(effectiveReusePolicy(undefined)).toBe("NO_REUSE");
    const opened = open(fscRequirement("req-a", "oak-table", "Oak Table"));
    const accepted = accept(opened.state, opened.caseId!);
    const submitted = submitCert(accepted.state, opened.caseId!, { reusePolicy: "ASK_FOR_REUSE" });
    delete submitted.state.evidence[0].reusePolicy;
    const next = open(fscRequirement("req-b", "oak-chair", "Oak Chair"), submitted.state);
    expect(next.state.reuseConsents).toHaveLength(0);
    expect(next.state.cases.find((row) => row.requirementId === "req-b")?.state).not.toBe("READY");
    expect(discoverReusableEvidence({
      state: next.state,
      requirement: next.state.requirements.find((row) => row.id === "req-b")!,
      supplierId: "supplier-a",
      now: NOW,
    })).toBeUndefined();
  });

  it("does not retroactively bind historical evidence to the new terms version", () => {
    const opened = open(fscRequirement("req-a", "oak-table", "Oak Table"));
    const accepted = accept(opened.state, opened.caseId!);
    const submitted = submitCert(accepted.state, opened.caseId!, { reusePolicy: "ASK_FOR_REUSE" });
    submitted.state.evidence[0].agreementVersion = DATA_DISCLOSURE_TERMS_V1_DRAFT.version;
    submitted.state.disclosureAcceptances[0].agreementVersion = DATA_DISCLOSURE_TERMS_V1_DRAFT.version;
    expect(submitted.state.evidence[0].agreementVersion).toBe("v1-draft-legal-review");
    expect(currentDataDisclosureTerms().version).toBe("v1.1-draft-legal-review");
  });
});

describe("definition of done — ASK_FOR_REUSE consent", () => {
  it("recognises Product B as a candidate, waits for supplier approval, then reassesses without widening disclosure", () => {
    const openedA = open(fscRequirement("req-a", "oak-table", "Oak Table"));
    const acceptedA = accept(openedA.state, openedA.caseId!);
    const productA = submitCert(acceptedA.state, openedA.caseId!, {
      reusePolicy: "ASK_FOR_REUSE",
      disclosureMode: "PROTECTED_SOURCE",
    });
    expect(productA.state.cases[0].state).toBe("READY");
    expect(productA.state.claims[0].trustLevel).toBe("EVIDENCED");
    const originalAcceptance = productA.state.disclosureAcceptances[0];

    const openedB = open(fscRequirement("req-b", "oak-chair", "Oak Chair"), productA.state);
    const caseB = openedB.state.cases.find((row) => row.requirementId === "req-b")!;
    expect(caseB.state).not.toBe("READY");
    expect(openedB.state.claims.some((claim) => claim.caseId === caseB.id)).toBe(false);
    expect(openedB.state.reuseConsents).toHaveLength(1);
    const pending = openedB.state.reuseConsents[0];
    expect(pending.status).toBe("PENDING");
    expect(pending.evidenceReusePolicy).toBe("ASK_FOR_REUSE");
    expect(openedB.events.some((event) => event.type === "reuse.candidate_created")).toBe(true);
    expect(caseB.blockingReason).toBe("REUSE_CONSENT_REQUIRED");

    const replayOpen = applyCommand(
      openedB.state,
      { type: "SEND_REQUEST", caseId: caseB.id },
      NOW
    );
    expect(replayOpen.state.reuseConsents).toHaveLength(1);

    const approved = applyCommand(
      replayOpen.state,
      { type: "DECIDE_EVIDENCE_REUSE", caseId: caseB.id, consentId: pending.id, decision: "APPROVED", decidedBy: "supplier-a" },
      NOW
    );
    const consent = approved.state.reuseConsents[0];
    expect(consent.status).toBe("APPROVED");
    expect(consent.decision).toBe("APPROVED");
    expect(consent.decidedAt).toBeTruthy();
    expect(approved.state.evidence[0].reusePolicy).toBe("ASK_FOR_REUSE");
    expect(approved.state.evidence[0].disclosureMode).toBe("PROTECTED_SOURCE");
    expect(approved.state.disclosureAcceptances[0].createdAt).toBe(originalAcceptance.createdAt);
    expect(approved.state.disclosureAcceptances[0].termsHash).toBe(originalAcceptance.termsHash);
    const reusedClaim = approved.state.claims.find((claim) => claim.caseId === caseB.id)!;
    expect(reusedClaim.trustLevel).toBe("EVIDENCED");
    expect(approved.state.requirementAssessments.some((row) => row.caseId === caseB.id && row.result === "INSUFFICIENT")).toBe(true);
    expect(approved.state.cases.find((row) => row.id === caseB.id)?.state).not.toBe("READY");

    const replayApprove = applyCommand(
      approved.state,
      { type: "DECIDE_EVIDENCE_REUSE", caseId: caseB.id, consentId: pending.id, decision: "APPROVED", decidedBy: "supplier-a" },
      NOW
    );
    expect(replayApprove.state.claims.filter((claim) => claim.caseId === caseB.id && claim.evidenceId === approved.state.evidence[0].id)).toHaveLength(1);

    const openedC = open(fscRequirement("req-c", "oak-cabinet", "Oak Cabinet"), replayApprove.state);
    const caseC = openedC.state.cases.find((row) => row.requirementId === "req-c")!;
    expect(caseC.state).not.toBe("READY");
    expect(openedC.state.reuseConsents.filter((row) => row.caseId === caseC.id && row.status === "PENDING")).toHaveLength(1);
  });

  it("treats approved reuse of matching company-scoped evidence as sufficient without increasing strength", () => {
    const openedA = open(fscRequirement("req-a", "oak-table", "Oak Table"));
    const acceptedA = accept(openedA.state, openedA.caseId!);
    const productA = submitCert(acceptedA.state, openedA.caseId!, {
      reusePolicy: "ASK_FOR_REUSE",
      disclosureMode: "VERIFICATION_ONLY",
      scope: { kind: "company", id: "supplier-a", label: "Northwood Components GmbH" },
    });
    const openedB = open(fscRequirement("req-b", "oak-chair", "Oak Chair"), productA.state);
    const caseB = openedB.state.cases.find((row) => row.requirementId === "req-b")!;
    const consent = openedB.state.reuseConsents[0];
    const approved = applyCommand(
      openedB.state,
      { type: "DECIDE_EVIDENCE_REUSE", caseId: caseB.id, consentId: consent.id, decision: "APPROVED", decidedBy: "supplier-a" },
      NOW
    );
    const after = approved.state.cases.find((row) => row.id === caseB.id)!;
    expect(after.state).toBe("READY");
    expect(approved.state.claims.find((claim) => claim.caseId === caseB.id)?.trustLevel).toBe("EVIDENCED");
    expect(approved.state.evidence[0].disclosureMode).toBe("VERIFICATION_ONLY");
    const permission = approved.state.permissions.find((row) => {
      const claim = approved.state.claims.find((c) => c.id === row.claimId);
      return claim?.caseId === caseB.id;
    });
    expect(permission?.visibility === "VERIFICATION_ONLY" || permission?.visibility === "verification_only").toBe(true);
    expect(approved.state.requirementAssessments.some((row) => row.caseId === caseB.id && row.result === "SUFFICIENT")).toBe(true);
  });
});

describe("decline reuse", () => {
  it("leaves the requirement unresolved and does not recreate the same declined proposal", () => {
    const openedA = open(fscRequirement("req-a", "oak-table", "Oak Table"));
    const productA = submitCert(accept(openedA.state, openedA.caseId!).state, openedA.caseId!, {
      reusePolicy: "ASK_FOR_REUSE",
    });
    const openedB = open(fscRequirement("req-b", "oak-chair", "Oak Chair"), productA.state);
    const caseB = openedB.state.cases.find((row) => row.requirementId === "req-b")!;
    const declined = applyCommand(
      openedB.state,
      {
        type: "DECIDE_EVIDENCE_REUSE",
        caseId: caseB.id,
        consentId: openedB.state.reuseConsents[0].id,
        decision: "DECLINED",
        decidedBy: "supplier-a",
      },
      NOW
    );
    expect(declined.state.cases.find((row) => row.id === caseB.id)?.state).not.toBe("READY");
    expect(declined.state.claims.some((claim) => claim.caseId === caseB.id)).toBe(false);
    expect(declined.state.cases.find((row) => row.id === caseB.id)?.nextAction).toMatch(/new evidence/i);

    const replay = applyCommand(declined.state, { type: "SEND_REQUEST", caseId: caseB.id }, NOW);
    expect(replay.state.reuseConsents).toHaveLength(1);
    expect(replay.state.reuseConsents[0].status).toBe("DECLINED");
    expect(() =>
      applyCommand(
        replay.state,
        {
          type: "DECIDE_EVIDENCE_REUSE",
          caseId: caseB.id,
          consentId: replay.state.reuseConsents[0].id,
          decision: "APPROVED",
          decidedBy: "supplier-a",
        },
        NOW
      )
    ).toThrow(/already declined/);
  });
});

describe("automatic same-organisation reuse", () => {
  it("reuses compatible company-scoped evidence without asking again", () => {
    const openedA = open(fscRequirement("req-a", "oak-table", "Oak Table"));
    const productA = submitCert(accept(openedA.state, openedA.caseId!).state, openedA.caseId!, {
      reusePolicy: "REUSE_WITHIN_REQUESTING_ORGANISATION",
      disclosureMode: "PROTECTED_SOURCE",
      scope: { kind: "company", id: "supplier-a", label: "Northwood Components GmbH" },
    });
    const openedB = open(fscRequirement("req-b", "oak-chair", "Oak Chair"), productA.state);
    const caseB = openedB.state.cases.find((row) => row.requirementId === "req-b")!;
    expect(openedB.state.reuseConsents).toHaveLength(0);
    expect(caseB.state).toBe("READY");
    expect(openedB.state.evidence[0].disclosureMode).toBe("PROTECTED_SOURCE");
    expect(openedB.events.some((event) => event.type === "evidence.reused")).toBe(true);
  });

  it("asks again when organisation-scoped evidence is product-limited", () => {
    const openedA = open(fscRequirement("req-a", "oak-table", "Oak Table"));
    const productA = submitCert(accept(openedA.state, openedA.caseId!).state, openedA.caseId!, {
      reusePolicy: "REUSE_WITHIN_REQUESTING_ORGANISATION",
      scope: { kind: "product", id: "oak-table", label: "Oak Table" },
    });
    const openedB = open(fscRequirement("req-b", "oak-chair", "Oak Chair"), productA.state);
    expect(openedB.state.reuseConsents[0]?.status).toBe("PENDING");
    expect(openedB.state.cases.find((row) => row.requirementId === "req-b")?.state).not.toBe("READY");
  });

  it("does not silently reuse for an incompatible purpose", () => {
    const openedA = open(fscRequirement("req-a", "oak-table", "Oak Table"));
    const productA = submitCert(accept(openedA.state, openedA.caseId!).state, openedA.caseId!, {
      reusePolicy: "REUSE_WITHIN_REQUESTING_ORGANISATION",
      scope: { kind: "company", id: "supplier-a", label: "Northwood" },
    });
    const openedB = open(
      fscRequirement("req-b", "oak-chair", "Oak Chair", { purpose: "CUSTOMER_REQUEST" }),
      productA.state
    );
    expect(openedB.state.cases.find((row) => row.requirementId === "req-b")?.state).not.toBe("READY");
    expect(openedB.state.reuseConsents[0]?.status).toBe("PENDING");
  });

  it("does not silently reuse expired evidence", () => {
    const openedA = open(fscRequirement("req-a", "oak-table", "Oak Table"));
    const productA = submitCert(accept(openedA.state, openedA.caseId!).state, openedA.caseId!, {
      reusePolicy: "REUSE_WITHIN_REQUESTING_ORGANISATION",
      scope: { kind: "company", id: "supplier-a", label: "Northwood" },
    });
    const expired = applyCommand(productA.state, { type: "EXPIRE_EVIDENCE", evidenceId: productA.state.evidence[0].id }, NOW);
    const openedB = open(fscRequirement("req-b", "oak-chair", "Oak Chair"), expired.state);
    expect(openedB.state.reuseConsents).toHaveLength(0);
    expect(openedB.state.cases.find((row) => row.requirementId === "req-b")?.state).not.toBe("READY");
  });

  it("does not apply NO_REUSE evidence to another product", () => {
    const openedA = open(fscRequirement("req-a", "oak-table", "Oak Table"));
    const productA = submitCert(accept(openedA.state, openedA.caseId!, "NO_REUSE").state, openedA.caseId!, {
      reusePolicy: "NO_REUSE",
    });
    const openedB = open(fscRequirement("req-b", "oak-chair", "Oak Chair"), productA.state);
    expect(openedB.state.reuseConsents).toHaveLength(0);
    expect(openedB.state.claims.some((claim) => claim.caseId === openedB.caseId)).toBe(false);
  });
});

describe("sufficiency after reuse permission", () => {
  it("records CONFLICTING when reused evidence disagrees with a declared value", () => {
    const openedA = open(fscRequirement("req-a", "oak-table", "Oak Table"));
    const productA = submitCert(accept(openedA.state, openedA.caseId!).state, openedA.caseId!, {
      reusePolicy: "ASK_FOR_REUSE",
      scope: { kind: "company", id: "supplier-a", label: "Northwood" },
    });
    productA.state.evidence[0].extractedValue = "Different certificate scope";
    const openedB = open(fscRequirement("req-b", "oak-chair", "Oak Chair"), productA.state);
    const caseB = openedB.state.cases.find((row) => row.requirementId === "req-b")!;
    const approved = applyCommand(
      openedB.state,
      {
        type: "DECIDE_EVIDENCE_REUSE",
        caseId: caseB.id,
        consentId: openedB.state.reuseConsents[0].id,
        decision: "APPROVED",
        decidedBy: "supplier-a",
      },
      NOW
    );
    expect(approved.state.cases.find((row) => row.id === caseB.id)?.state).toBe("CONFLICT");
    expect(approved.state.requirementAssessments.some((row) => row.caseId === caseB.id && row.result === "CONFLICTING")).toBe(true);
    expect(approved.state.cases.find((row) => row.id === caseB.id)?.state).not.toBe("READY");
  });

  it("never treats reuse permission alone as READY for out-of-scope evidence", () => {
    const openedA = open(fscRequirement("req-a", "oak-table", "Oak Table"));
    const productA = submitCert(accept(openedA.state, openedA.caseId!).state, openedA.caseId!, {
      reusePolicy: "ASK_FOR_REUSE",
      scope: { kind: "product", id: "oak-table", label: "Oak Table" },
    });
    const openedB = open(fscRequirement("req-b", "oak-chair", "Oak Chair"), productA.state);
    const caseB = openedB.state.cases.find((row) => row.requirementId === "req-b")!;
    const approved = applyCommand(
      openedB.state,
      {
        type: "DECIDE_EVIDENCE_REUSE",
        caseId: caseB.id,
        consentId: openedB.state.reuseConsents[0].id,
        decision: "APPROVED",
        decidedBy: "supplier-a",
      },
      NOW
    );
    expect(approved.state.reuseConsents[0].status).toBe("APPROVED");
    expect(approved.state.cases.find((row) => row.id === caseB.id)?.state).not.toBe("READY");
  });
});
