import { afterEach, describe, expect, it } from "vitest";
import { applyCommand, emptyState } from "@/domain/source/engine";
import { currentDataDisclosureTerms, resetDataDisclosureTermsForTests } from "@/domain/source/disclosure-terms";
import { MemoryPersistence } from "@/infrastructure/database/memory";
import { dispatchCommand, resolveUserPrincipal } from "@/server/source/commands/dispatch";
import { issuePortalGrant, resolvePortalPrincipal } from "@/server/source/portal";
import { getCaseDetail, getEvidenceAccess, getSupplierPortalView } from "@/server/source/queries";
import { ROLE_CAPABILITIES } from "@/server/source/authorization";
import { SourceError, type CommandEnvelope } from "@/server/source/types";
import type { Command } from "@/domain/source/types";
import { leakScan } from "@/server/source/confidentiality";

const NOW = new Date("2026-08-19T11:00:00.000Z");

afterEach(() => {
  resetDataDisclosureTermsForTests();
});

async function setupTenant() {
  const store = new MemoryPersistence();
  const orgId = "holzwerk-ev";
  store.organisations.set(orgId, { id: orgId, name: "Holzwerk Schmidt GmbH", slug: "holzwerk-ev" });
  store.users.set("user-holzwerk-ev", {
    id: "user-holzwerk-ev",
    email: "owner@holzwerk-ev.example",
    displayName: "Schmidt",
  });
  store.memberships.push({
    id: "mem-holzwerk-ev",
    userId: "user-holzwerk-ev",
    organisationId: orgId,
    role: "OWNER",
    capabilities: [...ROLE_CAPABILITIES.OWNER],
  });
  const state = emptyState({ id: orgId, name: "Holzwerk Schmidt GmbH" });
  state.actors.push({
    id: "supplier-a",
    name: "Northwood Components",
    legalName: "Northwood Components GmbH",
    kind: "organisation",
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
  const opened = applyCommand(
    state,
    {
      type: "OPEN_REQUIREMENT",
      requirement: {
        id: "req-origin",
        tenantId: orgId,
        subjectId: "SRC-001",
        subjectLabel: "SRC-001",
        productIds: ["SRC-001"],
        propertyId: "recycled_content",
        propertyLabel: "Recycled content",
        datasetId: "espr-al-2027",
        purpose: "DPP_COMPLIANCE",
        requiredTrustLevel: "EVIDENCED",
        requiredPermissionLevel: "granted",
        requiredBy: "2027-02-01",
        priority: 90,
        createdAt: NOW.toISOString(),
      },
      declaredSupplierId: "supplier-a",
    },
    NOW
  );
  await store.saveEngine(orgId, opened.state);
  const token = "portal-ev-disclosure";
  await issuePortalGrant(store, {
    token,
    actorId: "supplier-a",
    organisationId: orgId,
    allowedCaseIds: [opened.caseId!],
    allowedRequirementIds: ["req-origin"],
    expiresAt: "2027-08-19T00:00:00.000Z",
  });
  const portal = await resolvePortalPrincipal(store, token, NOW);
  const manufacturer = await resolveUserPrincipal(store, "user-holzwerk-ev", orgId);
  return { store, orgId, caseId: opened.caseId!, portal, manufacturer, token };
}

function envelope(
  principal: { grantId?: string; userId?: string; organisationId: string },
  command: Command,
  extra?: Partial<CommandEnvelope>
): CommandEnvelope {
  return {
    commandId: extra?.commandId ?? `cmd-${Math.random().toString(16).slice(2)}`,
    idempotencyKey: extra?.idempotencyKey ?? `key-${Math.random().toString(16).slice(2)}`,
    principalId: principal.grantId ?? principal.userId ?? "principal",
    organisationId: principal.organisationId,
    issuedAt: NOW.toISOString(),
    command,
    ...extra,
  };
}

async function acceptPortal(args: Awaited<ReturnType<typeof setupTenant>>, extra?: { authorityConfirmed?: boolean; termsAccepted?: boolean }) {
  const terms = currentDataDisclosureTerms();
  return dispatchCommand({
    store: args.store,
    principal: args.portal,
    envelope: envelope(args.portal, {
      type: "ACCEPT_EVIDENCE_DISCLOSURE",
      caseId: args.caseId,
      authorityConfirmed: extra?.authorityConfirmed ?? true,
      termsAccepted: extra?.termsAccepted ?? true,
      agreementId: terms.agreementId,
      agreementVersion: terms.version,
      reusePolicy: "REUSE_WITHIN_REQUESTING_ORGANISATION",
    }),
    now: NOW,
  });
}

describe("evidence disclosure enforcement", () => {
  it("cannot submit portal evidence without an evidence route", async () => {
    const ctx = await setupTenant();
    await acceptPortal(ctx);
    await expect(
      dispatchCommand({
        store: ctx.store,
        principal: ctx.portal,
        envelope: envelope(ctx.portal, {
          type: "SUBMIT_RESPONSE",
          caseId: ctx.caseId,
          value: "67",
          permission: "GRANTED",
          evidence: { filename: "cert.pdf" },
        }),
        now: NOW,
      })
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects portal submit without both acceptances", async () => {
    const ctx = await setupTenant();
    await expect(
      acceptPortal(ctx, { authorityConfirmed: false, termsAccepted: true })
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      acceptPortal(ctx, { authorityConfirmed: true, termsAccepted: false })
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      dispatchCommand({
        store: ctx.store,
        principal: ctx.portal,
        envelope: envelope(ctx.portal, {
          type: "SUBMIT_RESPONSE",
          caseId: ctx.caseId,
          value: "67",
          permission: "GRANTED",
          evidenceRoute: "ORIGINAL_DOCUMENT",
          disclosureMode: "SHARE_SOURCE",
          evidence: { filename: "cert.pdf" },
        }),
        now: NOW,
      })
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("SHARE_SOURCE allows authorised manufacturer source access", async () => {
    const ctx = await setupTenant();
    await acceptPortal(ctx);
    await dispatchCommand({
      store: ctx.store,
      principal: ctx.portal,
      envelope: envelope(ctx.portal, {
        type: "SUBMIT_RESPONSE",
        caseId: ctx.caseId,
        value: "67",
        permission: "GRANTED",
        evidenceRoute: "ORIGINAL_DOCUMENT",
        disclosureMode: "SHARE_SOURCE",
        evidence: { filename: "material-composition.pdf", extractedValue: "67", confidence: 99 },
      }),
      now: NOW,
    });
    const detail = await getCaseDetail(ctx.store, ctx.manufacturer, ctx.caseId);
    expect(detail.evidence?.type).toBe("EVIDENCE_RECORD");
    expect(detail.evidenceSummary?.originalAccess).toBe("available");
    expect(detail.claim?.value).toBe("67");
    if (detail.evidence?.type === "EVIDENCE_RECORD") {
      const access = await getEvidenceAccess(ctx.store, ctx.manufacturer, detail.evidence.opaqueRef);
      expect(access.type).toBe("EVIDENCE_RECORD");
      expect(JSON.stringify(access)).toContain("material-composition.pdf");
    }
  });

  it("PROTECTED_SOURCE blocks manufacturer source access but keeps the derived claim", async () => {
    const ctx = await setupTenant();
    await acceptPortal(ctx);
    await dispatchCommand({
      store: ctx.store,
      principal: ctx.portal,
      envelope: envelope(ctx.portal, {
        type: "SUBMIT_RESPONSE",
        caseId: ctx.caseId,
        value: "67",
        permission: "GRANTED",
        evidenceRoute: "ORIGINAL_DOCUMENT",
        disclosureMode: "PROTECTED_SOURCE",
        evidence: { filename: "material-composition-confidential.pdf", extractedValue: "67", confidence: 99 },
      }),
      now: NOW,
    });
    const detail = await getCaseDetail(ctx.store, ctx.manufacturer, ctx.caseId);
    expect(detail.evidence?.type).toBe("EVIDENCE_ATTESTATION");
    expect(detail.evidenceSummary?.originalAccess).toBe("confidential");
    expect(detail.claim?.value).toBe("67");
    expect(JSON.stringify(detail)).not.toContain("material-composition-confidential.pdf");
    expect(leakScan(detail)).toEqual([]);
    const state = ctx.store.loadEngine(ctx.orgId);
    const evidenceId = state.evidence[0].id;
    const access = await getEvidenceAccess(ctx.store, ctx.manufacturer, evidenceId);
    expect(access.type).toBe("EVIDENCE_ATTESTATION");
    expect(JSON.stringify(access)).not.toContain("signedUrl");
    expect(JSON.stringify(access)).not.toContain("material-composition-confidential.pdf");
  });

  it("VERIFICATION_ONLY hides confidential extracted content", async () => {
    const ctx = await setupTenant();
    await acceptPortal(ctx);
    await dispatchCommand({
      store: ctx.store,
      principal: ctx.portal,
      envelope: envelope(ctx.portal, {
        type: "SUBMIT_RESPONSE",
        caseId: ctx.caseId,
        value: "secret-formula-67",
        permission: "GRANTED",
        evidenceRoute: "ORIGINAL_DOCUMENT",
        disclosureMode: "VERIFICATION_ONLY",
        evidence: { filename: "secret-lab.pdf", extractedValue: "secret-formula-67", confidence: 99 },
      }),
      now: NOW,
    });
    const detail = await getCaseDetail(ctx.store, ctx.manufacturer, ctx.caseId);
    expect(detail.claim?.value).toBeUndefined();
    expect(detail.claim?.verificationSummary).toMatch(/confidential evidence/i);
    expect(JSON.stringify(detail)).not.toContain("secret-formula-67");
    expect(JSON.stringify(detail)).not.toContain("secret-lab.pdf");
    expect(detail.evidenceSummary?.disclosureMode).toBe("VERIFICATION_ONLY");
  });

  it("CANNOT_DISCLOSE does not resolve the requirement", async () => {
    const ctx = await setupTenant();
    await acceptPortal(ctx);
    await dispatchCommand({
      store: ctx.store,
      principal: ctx.portal,
      envelope: envelope(ctx.portal, {
        type: "SUBMIT_RESPONSE",
        caseId: ctx.caseId,
        value: "",
        permission: "DENIED",
        evidenceRoute: "CANNOT_PROVIDE",
        disclosureMode: "CANNOT_DISCLOSE",
        cannotProvideReason: "confidentiality",
      }),
      now: NOW,
    });
    const detail = await getCaseDetail(ctx.store, ctx.manufacturer, ctx.caseId);
    expect(detail.state).not.toBe("READY");
    expect(detail.evidenceSummary?.sufficiency).toBe("INSUFFICIENT");
  });

  it("strips portal issuerClass so suppliers cannot self-award VERIFIED", async () => {
    const ctx = await setupTenant();
    await acceptPortal(ctx);
    await dispatchCommand({
      store: ctx.store,
      principal: ctx.portal,
      envelope: envelope(ctx.portal, {
        type: "SUBMIT_RESPONSE",
        caseId: ctx.caseId,
        value: "67",
        permission: "GRANTED",
        evidenceRoute: "ORIGINAL_DOCUMENT",
        disclosureMode: "SHARE_SOURCE",
        issuerClass: "laboratory",
        evidence: { filename: "cert.pdf", extractedValue: "67", confidence: 99 },
      }),
      now: NOW,
    });
    const state = ctx.store.loadEngine(ctx.orgId);
    expect(state.claims[0].trustLevel).toBe("EVIDENCED");
    expect(state.evidence[0].issuerClass).toBeUndefined();
  });

  it("denies cross-tenant case access", async () => {
    const ctx = await setupTenant();
    const acme = await resolveUserPrincipal(ctx.store, "user-acme-owner", "acme");
    await expect(getCaseDetail(ctx.store, acme, ctx.caseId)).rejects.toBeInstanceOf(SourceError);
    await expect(
      dispatchCommand({
        store: ctx.store,
        principal: ctx.portal,
        envelope: envelope(ctx.portal, {
          type: "SUBMIT_RESPONSE",
          caseId: "SRC-N-1",
          value: "1",
          permission: "GRANTED",
          evidenceRoute: "ORIGINAL_DOCUMENT",
          disclosureMode: "SHARE_SOURCE",
          evidence: { filename: "x.pdf" },
        }),
        now: NOW,
      })
    ).rejects.toBeInstanceOf(SourceError);
  });

  it("writes immutable acceptance and submission audit events", async () => {
    const ctx = await setupTenant();
    await acceptPortal(ctx);
    await dispatchCommand({
      store: ctx.store,
      principal: ctx.portal,
      envelope: envelope(ctx.portal, {
        type: "SUBMIT_RESPONSE",
        caseId: ctx.caseId,
        value: "67",
        permission: "GRANTED",
        evidenceRoute: "ORIGINAL_DOCUMENT",
        disclosureMode: "PROTECTED_SOURCE",
        evidence: { filename: "cert.pdf", extractedValue: "67", confidence: 99 },
      }),
      now: NOW,
    });
    const state = ctx.store.loadEngine(ctx.orgId);
    expect(state.events.some((e) => e.type === "authority.confirmed")).toBe(true);
    expect(state.events.some((e) => e.type === "disclosure.terms_accepted")).toBe(true);
    expect(state.events.some((e) => e.type === "evidence.uploaded")).toBe(true);
    const firstHash = state.disclosureAcceptances[0].termsHash;
    await acceptPortal(ctx);
    const after = ctx.store.loadEngine(ctx.orgId);
    expect(after.disclosureAcceptances).toHaveLength(1);
    expect(after.disclosureAcceptances[0].termsHash).toBe(firstHash);
  });
});

describe("evidence reuse consent enforcement", () => {
  async function setupReuseCandidate() {
    const ctx = await setupTenant();
    await acceptPortal(ctx);
    await dispatchCommand({
      store: ctx.store,
      principal: ctx.portal,
      envelope: envelope(ctx.portal, {
        type: "SUBMIT_RESPONSE",
        caseId: ctx.caseId,
        value: "67",
        permission: "GRANTED",
        evidenceRoute: "ORIGINAL_DOCUMENT",
        disclosureMode: "PROTECTED_SOURCE",
        reusePolicy: "ASK_FOR_REUSE",
        evidence: {
          filename: "material-composition-confidential.pdf",
          extractedValue: "67",
          confidence: 99,
        },
      }),
      now: NOW,
    });
    const state = ctx.store.loadEngine(ctx.orgId);
    const openedB = applyCommand(
      state,
      {
        type: "OPEN_REQUIREMENT",
        requirement: {
          id: "req-chair",
          tenantId: ctx.orgId,
          subjectId: "SRC-002",
          subjectLabel: "Oak Chair",
          productIds: ["SRC-002"],
          propertyId: "recycled_content",
          propertyLabel: "Recycled content",
          datasetId: "espr-al-2027",
          purpose: "DPP_COMPLIANCE",
          requiredTrustLevel: "EVIDENCED",
          requiredPermissionLevel: "granted",
          requiredBy: "2027-02-01",
          priority: 90,
          createdAt: NOW.toISOString(),
        },
        declaredSupplierId: "supplier-a",
      },
      NOW
    );
    await ctx.store.saveEngine(ctx.orgId, openedB.state);
    const caseB = openedB.state.cases.find((row) => row.requirementId === "req-chair")!;
    const tokenB = "portal-reuse-b";
    await issuePortalGrant(ctx.store, {
      token: tokenB,
      actorId: "supplier-a",
      organisationId: ctx.orgId,
      allowedCaseIds: [caseB.id],
      allowedRequirementIds: ["req-chair"],
      expiresAt: "2027-08-19T00:00:00.000Z",
    });
    const portalB = await resolvePortalPrincipal(ctx.store, tokenB, NOW);
    return { ...ctx, caseB: caseB.id, portalB, tokenB, consentId: openedB.state.reuseConsents[0]?.id };
  }

  it("does not attach or expose original evidence before supplier approval", async () => {
    const ctx = await setupReuseCandidate();
    const detail = await getCaseDetail(ctx.store, ctx.manufacturer, ctx.caseB);
    expect(detail.state).not.toBe("READY");
    expect(detail.reuseConsent?.status).toBe("PENDING");
    expect(JSON.stringify(detail)).not.toContain("material-composition-confidential.pdf");
    expect(leakScan(detail)).toEqual([]);
    const view = await getSupplierPortalView(ctx.store, ctx.portalB);
    expect(view.reuseRequests?.[0]?.evidenceLabel).toBe("material-composition-confidential.pdf");
    expect(view.reuseRequests?.[0]?.status).toBe("PENDING");
  });

  it("forbids the manufacturer from approving supplier reuse", async () => {
    const ctx = await setupReuseCandidate();
    await expect(
      dispatchCommand({
        store: ctx.store,
        principal: ctx.manufacturer,
        envelope: envelope(ctx.manufacturer, {
          type: "DECIDE_EVIDENCE_REUSE",
          caseId: ctx.caseB,
          consentId: ctx.consentId,
          decision: "APPROVED",
        }),
        now: NOW,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("forbids another supplier from approving reuse", async () => {
    const ctx = await setupReuseCandidate();
    await issuePortalGrant(ctx.store, {
      token: "portal-other-supplier",
      actorId: "supplier-other",
      organisationId: ctx.orgId,
      allowedCaseIds: [ctx.caseB],
      allowedRequirementIds: ["req-chair"],
      expiresAt: "2027-08-19T00:00:00.000Z",
    });
    const other = await resolvePortalPrincipal(ctx.store, "portal-other-supplier", NOW);
    await expect(
      dispatchCommand({
        store: ctx.store,
        principal: other,
        envelope: envelope(other, {
          type: "DECIDE_EVIDENCE_REUSE",
          caseId: ctx.caseB,
          consentId: ctx.consentId,
          decision: "APPROVED",
        }),
        now: NOW,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a portal grant deciding reuse outside its case scope", async () => {
    const ctx = await setupReuseCandidate();
    await expect(
      dispatchCommand({
        store: ctx.store,
        principal: ctx.portal,
        envelope: envelope(ctx.portal, {
          type: "DECIDE_EVIDENCE_REUSE",
          caseId: ctx.caseB,
          consentId: ctx.consentId,
          decision: "APPROVED",
        }),
        now: NOW,
      })
    ).rejects.toMatchObject({ code: "RESOURCE_UNAVAILABLE" });
  });

  it("keeps protected original bytes inaccessible after approved reuse", async () => {
    const ctx = await setupReuseCandidate();
    await dispatchCommand({
      store: ctx.store,
      principal: ctx.portalB,
      envelope: envelope(ctx.portalB, {
        type: "DECIDE_EVIDENCE_REUSE",
        caseId: ctx.caseB,
        consentId: ctx.consentId,
        decision: "APPROVED",
      }),
      now: NOW,
    });
    const detail = await getCaseDetail(ctx.store, ctx.manufacturer, ctx.caseB);
    expect(JSON.stringify(detail)).not.toContain("material-composition-confidential.pdf");
    const state = ctx.store.loadEngine(ctx.orgId);
    const evidenceId = state.evidence[0].id;
    const access = await getEvidenceAccess(ctx.store, ctx.manufacturer, evidenceId);
    expect(JSON.stringify(access)).not.toContain("signedUrl");
    expect(JSON.stringify(access)).not.toContain("material-composition-confidential.pdf");
  });

  it("isolates reuse candidates from another tenant", async () => {
    const ctx = await setupReuseCandidate();
    const otherStore = ctx.store;
    otherStore.organisations.set("other-org", { id: "other-org", name: "Other Co", slug: "other-org" });
    otherStore.users.set("user-other", { id: "user-other", email: "a@other.example", displayName: "Other" });
    otherStore.memberships.push({
      id: "mem-other",
      userId: "user-other",
      organisationId: "other-org",
      role: "OWNER",
      capabilities: [...ROLE_CAPABILITIES.OWNER],
    });
    const otherPrincipal = await resolveUserPrincipal(otherStore, "user-other", "other-org");
    await expect(getCaseDetail(otherStore, otherPrincipal, ctx.caseB)).rejects.toBeInstanceOf(SourceError);
  });
});

