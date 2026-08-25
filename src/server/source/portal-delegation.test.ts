import { describe, expect, it } from "vitest";
import { applyCommand, attemptProvenanceChain, emptyState } from "@/domain/source/engine";
import { currentDataDisclosureTerms } from "@/domain/source/disclosure-terms";
import type { InformationRequirement } from "@/domain/source/types";
import { MemoryPersistence } from "@/infrastructure/database/memory";
import { dispatchCommand, resolveUserPrincipal } from "@/server/source/commands/dispatch";
import { issuePortalGrant, resolvePortalPrincipal } from "@/server/source/portal";
import { getCaseDetail, getSupplierPortalView } from "@/server/source/queries";
import { ROLE_CAPABILITIES } from "@/server/source/authorization";
import { SourceError, type CommandEnvelope } from "@/server/source/types";
import type { Command } from "@/domain/source/types";
import { acceptPortalDisclosure, portalEvidenceSubmit } from "@/server/source/portal-disclosure-test";

const NOW = new Date("2026-08-25T09:00:00.000Z");

function requirement(id: string, extra?: Partial<InformationRequirement>): InformationRequirement {
  return {
    id,
    tenantId: "acme-del",
    subjectId: extra?.subjectId ?? "CHAIR-A",
    subjectLabel: extra?.subjectLabel ?? "Chair A",
    productIds: extra?.productIds ?? ["CHAIR-A"],
    propertyId: extra?.propertyId ?? "country_of_manufacture",
    propertyLabel: extra?.propertyLabel ?? "Country of manufacture",
    datasetId: "espr-al-2027",
    purpose: "DPP_COMPLIANCE",
    requiredTrustLevel: "EVIDENCED",
    requiredPermissionLevel: "granted",
    requiredBy: "2027-02-01",
    priority: 90,
    createdAt: NOW.toISOString(),
    ...extra,
  };
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

async function setupTwoProducts() {
  const store = new MemoryPersistence();
  const orgId = "acme-del";
  store.organisations.set(orgId, { id: orgId, name: "Acme Manufacturing B.V.", slug: orgId });
  store.users.set("user-acme-del", {
    id: "user-acme-del",
    email: "owner@acme-del.example",
    displayName: "Owner",
  });
  store.memberships.push({
    id: "mem-acme-del",
    userId: "user-acme-del",
    organisationId: orgId,
    role: "OWNER",
    capabilities: [...ROLE_CAPABILITIES.OWNER],
    status: "ACTIVE",
  });
  const seeded = emptyState({ id: orgId, name: "Acme Manufacturing B.V." });
  seeded.actors.push({
    id: "supplier-a",
    name: "Supplier A",
    legalName: "Supplier A GmbH",
    kind: "organisation",
    country: "Germany",
  });
  seeded.contacts.push({
    id: "ct-a",
    actorId: "supplier-a",
    role: "product_data",
    name: "Lena",
    email: "data@a.example",
    valid: true,
    primary: true,
  });
  const openedA = applyCommand(
    seeded,
    { type: "OPEN_REQUIREMENT", requirement: requirement("req-chair-a"), declaredSupplierId: "supplier-a" },
    NOW
  );
  const openedB = applyCommand(
    openedA.state,
    {
      type: "OPEN_REQUIREMENT",
      requirement: requirement("req-table-b", {
        subjectId: "TABLE-B",
        subjectLabel: "Table B",
        productIds: ["TABLE-B"],
      }),
      declaredSupplierId: "supplier-a",
    },
    NOW
  );
  await store.saveEngine(orgId, openedB.state);
  const token = "portal-del-supplier-a";
  await issuePortalGrant(store, {
    token,
    actorId: "supplier-a",
    organisationId: orgId,
    allowedCaseIds: [openedA.caseId!, openedB.caseId!],
    allowedRequirementIds: ["req-chair-a", "req-table-b"],
    expiresAt: "2027-08-25T00:00:00.000Z",
  });
  const portal = await resolvePortalPrincipal(store, token, NOW);
  const manufacturer = await resolveUserPrincipal(store, "user-acme-del", orgId);
  return {
    store,
    orgId,
    portal,
    manufacturer,
    token,
    caseA: openedA.caseId!,
    caseB: openedB.caseId!,
  };
}

function queuedRows(store: MemoryPersistence, caseId?: string) {
  return store.outbox.filter((row) => {
    if (row.eventType !== "email.queued") return false;
    if (!caseId) return true;
    const ids = row.payload.caseIds;
    return Array.isArray(ids) && ids.includes(caseId);
  });
}

function tokenFromOutbox(row: { payload: Record<string, unknown> }) {
  const text = typeof row.payload.text === "string" ? row.payload.text : "";
  const match = text.match(/\/s\/([A-Za-z0-9_-]+)/);
  expect(match?.[1]).toBeTruthy();
  return match![1];
}

describe("supplier portal requirement isolation", () => {
  it("does not copy Product A routing onto Product B", async () => {
    const ctx = await setupTwoProducts();
    await acceptPortalDisclosure(ctx.store, ctx.portal, ctx.caseA, NOW);
    await dispatchCommand({
      store: ctx.store,
      principal: ctx.portal,
      envelope: envelope(ctx.portal, { type: "MARK_UNKNOWN", caseId: ctx.caseA, choice: "ask_supplier" }),
      now: NOW,
    });

    const state = ctx.store.loadEngine(ctx.orgId);
    const productA = state.cases.find((item) => item.id === ctx.caseA)!;
    const productB = state.cases.find((item) => item.id === ctx.caseB)!;
    expect(productA.state).toBe("WAITING_UPSTREAM");
    expect(productA.resolutionOutcome).not.toBe("READY");
    expect(productB.id).not.toBe(productA.id);
    expect(productB.requirementId).not.toBe(productA.requirementId);
    expect(productB.state).not.toBe(productA.state);
    expect(productB.blockingReason).not.toBe(productA.blockingReason);

    const view = await getSupplierPortalView(ctx.store, ctx.portal);
    const questionA = view.questions.find((item) => item.id === ctx.caseA)!;
    const questionB = view.questions.find((item) => item.id === ctx.caseB)!;
    expect(questionA.subjectId).toBe("CHAIR-A");
    expect(questionB.subjectId).toBe("TABLE-B");
    expect(questionB.submitted).toBe(false);
    expect(questionB.state).not.toBe("READY");
  });
});

describe("colleague delegation", () => {
  it("queues a scoped request and does not mark READY", async () => {
    const ctx = await setupTwoProducts();
    const before = queuedRows(ctx.store).length;
    const outcome = await dispatchCommand({
      store: ctx.store,
      principal: ctx.portal,
      envelope: envelope(ctx.portal, {
        type: "ASSIGN_COLLEAGUE",
        caseId: ctx.caseA,
        contact: { actorId: "supplier-a", role: "compliance", name: "Alex", email: "alex@a.example" },
      }),
      now: NOW,
    });
    if (outcome.status === "error") throw new Error(outcome.message);

    expect(outcome.status).toBe("ok");
    expect(outcome.events.some((event) => event.type === "request.delegated")).toBe(true);
    expect(outcome.sideEffects.some((row) => row.type === "email.queued")).toBe(true);

    const state = ctx.store.loadEngine(ctx.orgId);
    const resolution = state.cases.find((item) => item.id === ctx.caseA)!;
    expect(resolution.state).toBe("WAITING_RESPONSE");
    expect(resolution.resolutionOutcome).not.toBe("READY");
    const handoff = state.attempts.find((item) => item.caseId === ctx.caseA && item.method === "colleague_handoff");
    expect(handoff?.parentAttemptId).toBeTruthy();
    expect(handoff?.delegatedFromActorId).toBe("supplier-a");
    expect(handoff?.portalGrantId).toBeTruthy();

    const added = queuedRows(ctx.store, ctx.caseA).slice(before);
    const delegated = added.find((row) => String(row.semanticKey).includes(":DELEGATE:"));
    expect(delegated).toBeTruthy();
    expect(delegated!.payload.to).toBe("alex@a.example");
    expect(delegated!.payload.caseIds).toEqual([ctx.caseA]);

    const grant = ctx.store.portalGrants.find((item) => item.id === delegated!.payload.portalGrantId);
    expect(grant?.allowedCaseIds).toEqual([ctx.caseA]);
    expect(grant?.allowedRequirementIds).toEqual(["req-chair-a"]);
    expect(grant?.allowedCaseIds).not.toContain(ctx.caseB);

    const colleague = await resolvePortalPrincipal(ctx.store, tokenFromOutbox(delegated!), NOW);
    expect(colleague.allowedCaseIds).toEqual([ctx.caseA]);
    const colleagueView = await getSupplierPortalView(ctx.store, colleague);
    expect(colleagueView.questions.map((item) => item.id)).toEqual([ctx.caseA]);

    await expect(
      dispatchCommand({
        store: ctx.store,
        principal: colleague,
        envelope: envelope(colleague, { type: "MARK_UNKNOWN", caseId: ctx.caseB, choice: "do_not_have" }),
        now: NOW,
      })
    ).rejects.toBeInstanceOf(SourceError);
  });

  it("rejects colleague assignment without a reachable email", async () => {
    const ctx = await setupTwoProducts();
    await expect(
      dispatchCommand({
        store: ctx.store,
        principal: ctx.portal,
        envelope: envelope(ctx.portal, {
          type: "ASSIGN_COLLEAGUE",
          caseId: ctx.caseA,
          contact: { actorId: "supplier-a", role: "compliance", name: "Alex", email: "not-an-email" },
        }),
        now: NOW,
      })
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const state = ctx.store.loadEngine(ctx.orgId);
    expect(state.cases.find((item) => item.id === ctx.caseA)?.resolutionOutcome).not.toBe("READY");
  });
});

describe("supplier upstream delegation", () => {
  it("does not queue or claim request sent when only an organisation is known", async () => {
    const ctx = await setupTwoProducts();
    const before = queuedRows(ctx.store).length;
    const grantsBefore = ctx.store.portalGrants.length;
    const outcome = await dispatchCommand({
      store: ctx.store,
      principal: ctx.portal,
      envelope: envelope(ctx.portal, {
        type: "FORWARD_UPSTREAM",
        caseId: ctx.caseA,
        upstream: { name: "Mill Oy", legalName: "Mill Oy", country: "Finland" },
        mode: "on_behalf",
      }),
      now: NOW,
    });
    if (outcome.status === "error") throw new Error(outcome.message);

    expect(outcome.events.some((event) => event.type === "request.upstream_identified")).toBe(true);
    expect(outcome.events.some((event) => event.type === "request.forwarded")).toBe(false);
    expect(outcome.sideEffects.some((row) => row.type === "email.queued")).toBe(false);
    expect(queuedRows(ctx.store)).toHaveLength(before);
    expect(ctx.store.portalGrants).toHaveLength(grantsBefore);

    const state = ctx.store.loadEngine(ctx.orgId);
    const resolution = state.cases.find((item) => item.id === ctx.caseA)!;
    expect(resolution.state).toBe("CONTACT_REQUIRED");
    expect(resolution.nextAction).toMatch(/Contact details required — request not sent/i);
    expect(resolution.resolutionOutcome).not.toBe("READY");
    const productB = state.cases.find((item) => item.id === ctx.caseB)!;
    expect(productB.state).not.toBe("CONTACT_REQUIRED");
  });

  it("queues an upstream request with email, scopes the grant, and keeps evidence provenance", async () => {
    const ctx = await setupTwoProducts();
    const outcome = await dispatchCommand({
      store: ctx.store,
      principal: ctx.portal,
      envelope: envelope(ctx.portal, {
        type: "FORWARD_UPSTREAM",
        caseId: ctx.caseA,
        upstream: {
          name: "Mill Oy",
          legalName: "Mill Oy",
          country: "Finland",
          email: "kai@mill.example",
          contactName: "Kai",
        },
        mode: "on_behalf",
      }),
      now: NOW,
    });
    if (outcome.status === "error") throw new Error(outcome.message);
    expect(outcome.events.some((event) => event.type === "request.forwarded")).toBe(true);
    expect(outcome.sideEffects.some((row) => row.type === "email.queued")).toBe(true);

    const forwarded = queuedRows(ctx.store, ctx.caseA).find((row) => String(row.semanticKey).includes(":UPSTREAM:"));
    expect(forwarded?.payload.to).toBe("kai@mill.example");
    expect(forwarded?.payload.caseIds).toEqual([ctx.caseA]);
    const grant = ctx.store.portalGrants.find((item) => item.id === forwarded!.payload.portalGrantId);
    expect(grant?.allowedCaseIds).toEqual([ctx.caseA]);
    expect(grant?.allowedCaseIds).not.toContain(ctx.caseB);

    const millPortal = await resolvePortalPrincipal(ctx.store, tokenFromOutbox(forwarded!), NOW);
    const millView = await getSupplierPortalView(ctx.store, millPortal);
    expect(millView.questions.map((item) => item.id)).toEqual([ctx.caseA]);
    expect(millView.questions[0]?.subjectId).toBe("CHAIR-A");

    await acceptPortalDisclosure(ctx.store, millPortal, ctx.caseA, NOW);
    await dispatchCommand({
      store: ctx.store,
      principal: millPortal,
      envelope: envelope(
        millPortal,
        portalEvidenceSubmit(ctx.caseA, {
          value: "FI",
          evidence: { filename: "origin.pdf", extractedValue: "FI", confidence: 99 },
        })
      ),
      now: NOW,
    });

    const after = ctx.store.loadEngine(ctx.orgId);
    const evidence = after.evidence.find((item) => item.filename === "origin.pdf");
    expect(evidence?.ownerActorId).toBe(grant?.actorId);
    expect(evidence?.sourceAttemptId).toBeTruthy();
    const chain = attemptProvenanceChain(after, evidence?.sourceAttemptId);
    expect(chain.map((item) => item.actorId)).toEqual(["supplier-a", grant?.actorId]);
    expect(chain[1]?.delegatedFromActorId).toBe("supplier-a");
    expect(chain[1]?.parentAttemptId).toBe(chain[0]?.id);
    expect(chain[1]?.portalGrantId).toBe(grant?.id);

    const terms = currentDataDisclosureTerms();
    const detail = await getCaseDetail(ctx.store, ctx.manufacturer, ctx.caseA);
    expect(detail.attempts.some((item) => item.method === "upstream_request" && item.parentAttemptId)).toBe(true);
    expect(detail.requirement?.purpose).toBe("DPP_COMPLIANCE");
    expect(terms.purpose).toMatch(/provenance/i);
  });
});
