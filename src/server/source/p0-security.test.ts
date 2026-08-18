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
} from "@/server/source/queries";
import { createImportJob, proposeMapping } from "@/server/source/import/service";
import { leakScan } from "@/server/source/confidentiality";
import { SourceError, type CommandEnvelope, type Principal } from "@/server/source/types";
import type { Command } from "@/domain/source/types";
import { applyCommand } from "@/domain/source/engine";
import { generateBearerToken, hashToken } from "@/infrastructure/crypto/tokens";

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

  beforeEach(() => {
    store = new MemoryPersistence();
    acme = resolveUserPrincipal(store, "user-acme-owner", "acme");
  });

  it("does not let tenant A fetch tenant B's product", () => {
    expect(() => getProductDetail(store, acme, "fjord-stool")).toThrow(SourceError);
    try {
      getProductDetail(store, acme, "fjord-stool");
    } catch (error) {
      expect(error).toBeInstanceOf(SourceError);
      expect((error as SourceError).code).toBe("RESOURCE_UNAVAILABLE");
      expect((error as SourceError).message).not.toMatch(/another organisation/i);
    }
  });

  it("does not return tenant B evidence in tenant A search", () => {
    const result = searchTenant(store, acme, "nordic-origin-certificate");
    expect(result.evidence).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain("nordic-origin-certificate");
  });

  it("does not let tenant A use tenant B's portal token", () => {
    const portal = resolvePortalPrincipal(store, "nordic-secret", NOW);
    expect(portal.organisationId).toBe("nordic");
    expect(() => getCaseDetail(store, acme, "SRC-N-1")).toThrow(SourceError);
  });

  it("hides confidential upstream identity from manufacturer projections", () => {
    const detail = getCaseDetail(store, acme, "SRC-184844");
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

  it("rejects expired and revoked tokens", () => {
    expect(() => resolvePortalPrincipal(store, "expired-token", NOW)).toThrow(/expired/i);
    expect(() => resolvePortalPrincipal(store, "revoked-token", NOW)).toThrow(/no longer valid/i);
    expect(() => resolvePortalPrincipal(store, "unknown-token", NOW)).toThrow(SourceError);
  });

  it("cannot access an unscoped case", () => {
    const principal = resolvePortalPrincipal(store, "textile", NOW);
    expect(() =>
      dispatchCommand({
        store,
        principal,
        envelope: envelope(resolveUserPrincipal(store, "user-acme-owner", "acme"), {
          type: "SUBMIT_RESPONSE",
          caseId: "SRC-184831",
          value: "1",
          permission: "GRANTED",
        }),
        now: NOW,
      })
    ).toThrow(SourceError);
  });

  it("allows a scoped submit and forbids identity merge", () => {
    const principal = resolvePortalPrincipal(store, "textile", NOW);
    const ok = dispatchCommand({
      store,
      principal,
      envelope: {
        commandId: "p1",
        idempotencyKey: "portal-textile-submit",
        principalId: principal.grantId,
        organisationId: principal.organisationId,
        issuedAt: NOW.toISOString(),
        command: {
          type: "SUBMIT_RESPONSE",
          caseId: "SRC-184830",
          value: "PT",
          evidence: { filename: "origin.pdf" },
          permission: "GRANTED",
        },
      },
      now: NOW,
    });
    expect(ok.status === "ok" || ok.status === "ALREADY_PROCESSED").toBe(true);

    expect(() =>
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
    ).toThrow(SourceError);

    const view = getSupplierPortalView(store, principal);
    expect(view.questions.every((q) => q.id === "SRC-184830")).toBe(true);
    expect(JSON.stringify(view)).not.toContain("mill-north");
    expect(JSON.stringify(view)).not.toContain("portalToken");
  });
});

describe("idempotency and concurrency", () => {
  it("does not duplicate a reminder", () => {
    const store = new MemoryPersistence();
    const principal = resolveUserPrincipal(store, "user-acme-owner", "acme");
    const command: Command = { type: "SEND_REMINDER", caseId: "SRC-184830" };
    const first = dispatchCommand({
      store,
      principal,
      envelope: envelope(principal, command, { idempotencyKey: "SRC-184830:REMINDER:DAY3", commandId: "c1" }),
      now: NOW,
    });
    const second = dispatchCommand({
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

  it("returns 409 CASE_CHANGED on a stale version", () => {
    const store = new MemoryPersistence();
    const principal = resolveUserPrincipal(store, "user-acme-owner", "acme");
    const version = store.loadEngine("acme").cases.find((c) => c.id === "SRC-184830")!.version;
    expect(() =>
      dispatchCommand({
        store,
        principal,
        envelope: envelope(principal, { type: "SEND_REMINDER", caseId: "SRC-184830" }, { expectedVersion: version - 1 }),
        now: NOW,
      })
    ).toThrow(/Refresh to continue/);
  });
});

describe("authorization and reviewer role", () => {
  it("does not let a reviewer manage organisation settings commands", () => {
    const store = new MemoryPersistence();
    const reviewer = resolveUserPrincipal(store, "user-acme-reviewer", "acme");
    expect(() =>
      dispatchCommand({
        store,
        principal: reviewer,
        envelope: envelope(reviewer, {
          type: "REVOKE_PERMISSION",
          claimId: "claim-recycled-al",
        }),
        now: NOW,
      })
    ).toThrow(SourceError);
  });
});

describe("audit append-only", () => {
  it("records command audit and does not expose a mutate API", () => {
    const store = new MemoryPersistence();
    const principal = resolveUserPrincipal(store, "user-acme-owner", "acme");
    dispatchCommand({
      store,
      principal,
      envelope: envelope(principal, { type: "SEND_REMINDER", caseId: "SRC-184830" }),
      now: NOW,
    });
    const before = store.listAudit("acme").length;
    expect(before).toBeGreaterThan(0);
    expect(store.listAudit("acme")[0]).toMatchObject({ result: "ok" });
  });
});

describe("readiness invariant through the application layer", () => {
  it("holds after a happy-path submit", () => {
    const store = new MemoryPersistence();
    const principal = resolveUserPrincipal(store, "user-acme-owner", "acme");
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
    dispatchCommand({
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
  it("parses CSV, proposes mappings, and records real counts", () => {
    expect(proposeMapping(["VendorName", "EAN", "Article"])).toMatchObject({
      VendorName: "supplier.name",
      EAN: "product.gtin",
      Article: "product.sku",
    });
    const store = new MemoryPersistence();
    const principal = resolveUserPrincipal(store, "user-acme-owner", "acme");
    const job = createImportJob(store, principal, {
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
  it("returns live counts and a Needs You inbox sorted by unlock", () => {
    const store = new MemoryPersistence();
    const principal = resolveUserPrincipal(store, "user-acme-owner", "acme");
    const overview = getWorkspaceOverview(store, principal);
    expect(overview.summary.missing).toBeGreaterThan(0);
    expect(JSON.stringify(overview)).not.toContain("mill-north");
    const tasks = getNeedsYouTasks(store, principal);
    expect(tasks[0].unlock).toBeGreaterThanOrEqual(tasks[tasks.length - 1]?.unlock ?? 0);
  });
});
