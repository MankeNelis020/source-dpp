import { describe, expect, it, beforeEach } from "vitest";
import { MemoryPersistence } from "@/infrastructure/database/memory";
import { dispatchCommand, resolveUserPrincipal, assertReadinessInvariant } from "@/server/source/commands/dispatch";
import { resolvePortalPrincipal } from "@/server/source/portal";
import {
  getCaseDetail,
  getProductDetail,
  getSupplierPortalView,
  searchTenant,
  getWorkspaceOverview,
  getNeedsYouTasks,
  getTenantAudit,
  getInternalAudit,
} from "@/server/source/queries";
import { createImportJob, proposeMapping } from "@/server/source/import/service";
import { leakScan } from "@/server/source/confidentiality";
import { SourceError, type CommandEnvelope, type Principal } from "@/server/source/types";
import type { Command } from "@/domain/source/types";
import { applyCommand } from "@/domain/source/engine";
import { generateBearerToken, hashToken } from "@/infrastructure/crypto/tokens";
import { acceptPortalDisclosure, portalEvidenceSubmit } from "@/server/source/portal-disclosure-test";

const NOW = new Date("2026-08-17T09:00:00.000Z");

function envelope(principal: Principal, command: Command, extra?: Partial<CommandEnvelope>): CommandEnvelope {
  return {
    commandId: `cmd-${Math.random().toString(16).slice(2)}`,
    idempotencyKey: extra?.idempotencyKey ?? `key-${Math.random().toString(16).slice(2)}`,
    principalId: principal.userId,
    organisationId: principal.organisationId,
    issuedAt: NOW.toISOString(),
    command,
    ...extra,
  };
}

describe("tenant isolation", () => {
  let store: MemoryPersistence;
  let acme: Principal;

  beforeEach(async () => {
    store = new MemoryPersistence();
    acme = await resolveUserPrincipal(store, "user-acme-owner", "acme");
  });

  it("does not let tenant A fetch tenant B's product", async () => {
    await expect(getProductDetail(store, acme, "fjord-stool")).rejects.toMatchObject({ code: "RESOURCE_UNAVAILABLE" });
    try {
      await getProductDetail(store, acme, "fjord-stool");
    } catch (error) {
      expect(error).toBeInstanceOf(SourceError);
      expect((error as SourceError).message).not.toMatch(/another organisation/i);
    }
  });

  it("does not return tenant B evidence in tenant A search", async () => {
    const result = await searchTenant(store, acme, "nordic-origin-certificate");
    expect(result.evidence).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain("nordic-origin-certificate");
  });

  it("does not let tenant A use tenant B's portal token", async () => {
    const portal = await resolvePortalPrincipal(store, "nordic-secret", NOW);
    expect(portal.organisationId).toBe("nordic");
    await expect(getCaseDetail(store, acme, "SRC-N-1")).rejects.toBeInstanceOf(SourceError);
  });

  it("hides confidential upstream identity from manufacturer projections", async () => {
    const detail = await getCaseDetail(store, acme, "SRC-184844");
    expect(detail.actor?.kind).toBe("protected");
    if (detail.actor?.kind === "protected") {
      expect(detail.actor.sourceType).toBe("PROTECTED_UPSTREAM_SOURCE");
      expect(detail.actor.identityVisible).toBe(false);
    }
    expect(JSON.stringify(detail)).not.toContain("mill-north");
    expect(JSON.stringify(detail)).not.toContain("Nordic Fibre Mill");
    expect(leakScan(detail)).toEqual([]);
  });
});

describe("supplier portal grants", () => {
  let store: MemoryPersistence;

  beforeEach(() => {
    store = new MemoryPersistence();
  });

  it("rejects expired and revoked tokens", async () => {
    await expect(resolvePortalPrincipal(store, "expired-token", NOW)).rejects.toThrow(/expired/i);
    await expect(resolvePortalPrincipal(store, "revoked-token", NOW)).rejects.toThrow(/no longer valid/i);
    await expect(resolvePortalPrincipal(store, "unknown-token", NOW)).rejects.toBeInstanceOf(SourceError);
  });

  it("cannot access an unscoped case", async () => {
    const principal = await resolvePortalPrincipal(store, "textile", NOW);
    await expect(
      dispatchCommand({
        store,
        principal,
        envelope: envelope(await resolveUserPrincipal(store, "user-acme-owner", "acme"), {
          type: "SUBMIT_RESPONSE",
          caseId: "SRC-184831",
          value: "1",
          permission: "GRANTED",
        }),
        now: NOW,
      })
    ).rejects.toBeInstanceOf(SourceError);
  });

  it("allows a scoped submit and forbids identity merge", async () => {
    const principal = await resolvePortalPrincipal(store, "textile", NOW);
    await acceptPortalDisclosure(store, principal, "SRC-184830", NOW);
    const ok = await dispatchCommand({
      store,
      principal,
      envelope: {
        commandId: "p1",
        idempotencyKey: "portal-textile-submit",
        principalId: principal.grantId,
        organisationId: principal.organisationId,
        issuedAt: NOW.toISOString(),
        command: portalEvidenceSubmit("SRC-184830", {
          value: "PT",
          unit: undefined,
          evidence: { filename: "origin.pdf" },
        }),
      },
      now: NOW,
    });
    expect(ok.status === "ok" || ok.status === "ALREADY_PROCESSED").toBe(true);

    await expect(
      dispatchCommand({
        store,
        principal,
        envelope: {
          commandId: "p2",
          idempotencyKey: "portal-merge",
          principalId: principal.grantId,
          organisationId: principal.organisationId,
          issuedAt: NOW.toISOString(),
          command: { type: "CONFIRM_IDENTITY", caseId: "SRC-184830", decision: "merge" },
        },
        now: NOW,
      })
    ).rejects.toBeInstanceOf(SourceError);

    const view = await getSupplierPortalView(store, principal);
    expect(view.questions.every((q) => q.id === "SRC-184830")).toBe(true);
    expect(JSON.stringify(view)).not.toContain("mill-north");
    expect(JSON.stringify(view)).not.toContain("portalToken");
  });
});

describe("idempotency and concurrency", () => {
  it("does not duplicate a reminder", async () => {
    const store = new MemoryPersistence();
    const principal = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    const command: Command = { type: "SEND_REMINDER", caseId: "SRC-184830" };
    const first = await dispatchCommand({
      store,
      principal,
      envelope: envelope(principal, command, { idempotencyKey: "SRC-184830:REMINDER:DAY3", commandId: "c1" }),
      now: NOW,
    });
    const second = await dispatchCommand({
      store,
      principal,
      envelope: envelope(principal, command, { idempotencyKey: "SRC-184830:REMINDER:DAY3", commandId: "c2" }),
      now: NOW,
    });
    expect(first.status).toBe("ok");
    expect(second.status).toBe("ALREADY_PROCESSED");
    const reminders = store.loadEngine("acme").events.filter((e) => e.type === "AUTO_REMINDER_SENT" && e.caseId === "SRC-184830");
    expect(reminders.length).toBe(store.loadEngine("acme").requests.find((r) => r.caseId === "SRC-184830")!.reminderCount);
  });

  it("returns 409 CASE_CHANGED on a stale version", async () => {
    const store = new MemoryPersistence();
    const principal = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    const version = store.loadEngine("acme").cases.find((c) => c.id === "SRC-184830")!.version;
    await expect(
      dispatchCommand({
        store,
        principal,
        envelope: envelope(principal, { type: "SEND_REMINDER", caseId: "SRC-184830" }, { expectedVersion: version - 1 }),
        now: NOW,
      })
    ).rejects.toThrow(/Refresh to continue/);
  });
});

describe("authorization and reviewer role", () => {
  it("does not let a reviewer manage organisation settings commands", async () => {
    const store = new MemoryPersistence();
    const reviewer = await resolveUserPrincipal(store, "user-acme-reviewer", "acme");
    await expect(
      dispatchCommand({
        store,
        principal: reviewer,
        envelope: envelope(reviewer, {
          type: "REVOKE_PERMISSION",
          claimId: "claim-recycled-al",
        }),
        now: NOW,
      })
    ).rejects.toBeInstanceOf(SourceError);
  });
});

describe("audit append-only", () => {
  it("records command audit and does not expose a mutate API", async () => {
    const store = new MemoryPersistence();
    const principal = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    await dispatchCommand({
      store,
      principal,
      envelope: envelope(principal, { type: "SEND_REMINDER", caseId: "SRC-184830" }),
      now: NOW,
    });
    const before = store.listAudit("acme").length;
    expect(before).toBeGreaterThan(0);
    expect(store.listAudit("acme")[0]).toMatchObject({ result: "success" });
    const tenant = await getTenantAudit(store, principal);
    expect(JSON.stringify(tenant)).not.toContain("mill-north");
    const internal = await getInternalAudit(store, principal);
    expect(internal.length).toBeGreaterThan(0);
  });
});

describe("readiness invariant through the application layer", () => {
  it("holds after a happy-path submit", async () => {
    const store = new MemoryPersistence();
    const principal = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    const opened = applyCommand(
      store.loadEngine("acme"),
      {
        type: "OPEN_REQUIREMENT",
        requirement: {
          id: "req-inv",
          tenantId: "acme",
          subjectId: "AL-FRAME-881",
          subjectLabel: "Aluminium Frame",
          productIds: ["urban-chair-04"],
          propertyId: "recycled_content_inv",
          propertyLabel: "Invariant recycled content",
          datasetId: "espr-al-2027",
          purpose: "DPP_COMPLIANCE",
          requiredTrustLevel: "EVIDENCED",
          requiredPermissionLevel: "granted",
          requiredBy: "2027-02-01",
          priority: 10,
          createdAt: NOW.toISOString(),
        },
        declaredSupplierId: "supplier-a",
      },
      NOW
    );
    store.saveEngine("acme", opened.state);
    await dispatchCommand({
      store,
      principal,
      envelope: envelope(principal, {
        type: "SUBMIT_RESPONSE",
        caseId: opened.caseId!,
        value: "67",
        evidence: { filename: "cert.pdf" },
        permission: "GRANTED",
      }),
      now: NOW,
    });
    assertReadinessInvariant(store.loadEngine("acme"));
  });
});

describe("import jobs", () => {
  it("parses CSV, proposes mappings, and records real counts", async () => {
    expect(proposeMapping(["VendorName", "EAN", "Article"])).toMatchObject({
      VendorName: "supplier.name",
      EAN: "product.gtin",
      Article: "product.sku",
    });
    const store = new MemoryPersistence();
    const principal = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    const job = await createImportJob(store, principal, {
      products: "external_product_id,name,sku,gtin\nP1,Chair,CH-1,123\nP2,Table,TB-1,456\n,,,\n",
      suppliers: "external_supplier_id,name,legal_name,vat,country,domain\nS1,Metals,Metals GmbH,DE1,DE,metals.example\nS2,NoVat,NoVat BV,,NL,novat.example\n",
      bom: "product_id,component_id,component_name,quantity,unit,supplier_id\nP1,C1,Frame,1,ea,S1\n",
    });
    expect(job.state === "PARTIAL" || job.state === "COMPLETE").toBe(true);
    expect(job.summary?.products).toBe(2);
    expect(job.summary?.suppliers).toBe(2);
    expect(job.errorCount).toBe(1);
    expect(store.listImportEvents(job.id).some((e) => e.type === "entity.detected")).toBe(true);
    expect(store.listImportEvents(job.id).some((e) => e.type.startsWith("import."))).toBe(true);
  });
});

describe("tokens", () => {
  it("stores hashes not bearer secrets", () => {
    const token = generateBearerToken();
    expect(token).not.toBe(hashToken(token));
    expect(hashToken(token)).toHaveLength(64);
  });
});

describe("workspace projections", () => {
  it("returns live counts and a Needs You inbox sorted by unlock", async () => {
    const store = new MemoryPersistence();
    const principal = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    const overview = await getWorkspaceOverview(store, principal);
    expect(overview.summary.missing).toBeGreaterThan(0);
    expect(JSON.stringify(overview)).not.toContain("mill-north");
    const tasks = await getNeedsYouTasks(store, principal);
    expect(tasks[0].unlock).toBeGreaterThanOrEqual(tasks[tasks.length - 1]?.unlock ?? 0);
  });
});
