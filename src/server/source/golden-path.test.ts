import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyState } from "@/domain/source/engine";
import { evaluatePilotRun } from "@/domain/source/analytics";
import { createImportJob } from "@/server/source/import/service";
import { MemoryPersistence } from "@/infrastructure/database/memory";
import { MemoryEmailPort } from "@/infrastructure/database/ports";
import { resolveUserPrincipal, dispatchCommand } from "@/server/source/commands/dispatch";
import { executeResolutionRun } from "@/server/source/resolution-run";
import { resolvePortalPrincipal } from "@/server/source/portal";
import { getSupplierPortalView } from "@/server/source/queries";
import { processOutboxBatch } from "@/infrastructure/outbox/processor";
import { ROLE_CAPABILITIES } from "@/server/source/authorization";
import { acceptPortalDisclosure, portalEvidenceSubmit } from "@/server/source/portal-disclosure-test";

const NOW = new Date("2026-08-18T10:00:00.000Z");
const FIXTURES = join(process.cwd(), "fixtures/p1-manufacturer");

function manufacturerFiles() {
  return {
    products: readFileSync(join(FIXTURES, "artikelstamm.csv"), "utf8"),
    suppliers: readFileSync(join(FIXTURES, "lieferanten.csv"), "utf8"),
    bom: readFileSync(join(FIXTURES, "stueckliste.csv"), "utf8"),
    materials: readFileSync(join(FIXTURES, "materialien.csv"), "utf8"),
  };
}

async function emptyManufacturerPrincipal(store: MemoryPersistence) {
  const orgId = "holzwerk";
  store.organisations.set(orgId, { id: orgId, name: "Holzwerk Schmidt GmbH", slug: "holzwerk" });
  store.users.set("user-holzwerk", {
    id: "user-holzwerk",
    email: "owner@holzwerk.example",
    displayName: "Schmidt",
  });
  store.memberships.push({
    id: "mem-holzwerk",
    userId: "user-holzwerk",
    organisationId: orgId,
    role: "OWNER",
    capabilities: [...ROLE_CAPABILITIES.OWNER],
  });
  store.saveEngine(orgId, emptyState({ id: orgId, name: "Holzwerk Schmidt GmbH" }));
  return resolveUserPrincipal(store, "user-holzwerk", orgId);
}

describe("golden path — manufacturer import to supplier response", () => {
  it("creates outreach from execute, delivers one email, and accepts a scoped portal answer", async () => {
    const store = new MemoryPersistence();
    const principal = await emptyManufacturerPrincipal(store);
    await createImportJob(store, principal, manufacturerFiles(), NOW);

    const afterImport = store.loadEngine("holzwerk");
    expect(afterImport.requests).toHaveLength(0);
    expect(afterImport.pilotRuns[0].baseline.missing).toBeGreaterThan(0);
    expect(store.listOutbox("PENDING")).toHaveLength(0);

    await executeResolutionRun(store, principal, NOW);
    const afterExecute = store.loadEngine("holzwerk");
    expect(afterExecute.requests.length).toBeGreaterThan(0);
    const pending = store.listOutbox("PENDING", "holzwerk");
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((row) => typeof row.payload.to === "string" && String(row.payload.to).includes("@"))).toBe(true);
    expect(store.portalGrants.some((g) => g.tenantContextId === "holzwerk")).toBe(true);
    expect(store.portalGrants.some((g) => g.tokenHash && !["demo", "textile"].includes(g.id))).toBe(true);

    const email = new MemoryEmailPort();
    const processed = await processOutboxBatch({ store, email, now: NOW });
    expect(processed.processed).toBeGreaterThan(0);
    expect(email.sent.length).toBeGreaterThan(0);
    expect(email.sent[0].subject).toContain("Holzwerk Schmidt");
    expect(email.sent[0].text).toContain("Provide information");
    const match = email.sent[0].text.match(/\/s\/([A-Za-z0-9_-]+)/);
    expect(match?.[1]).toBeTruthy();
    const token = match![1];
    expect(token).not.toBe("demo");

    const portal = await resolvePortalPrincipal(store, token, NOW);
    expect(portal.organisationId).toBe("holzwerk");
    const view = await getSupplierPortalView(store, portal);
    expect(view.requesterName).toBe("Holzwerk Schmidt GmbH");
    expect(view.questions.length).toBeGreaterThan(0);

    const question = view.questions[0];
    const state = store.loadEngine("holzwerk");
    const resolution = state.cases.find((c) => c.id === question.id)!;
    const requirement = state.requirements.find((r) => r.id === resolution.requirementId)!;
    await acceptPortalDisclosure(store, portal, question.id, NOW);
    const outcome = await dispatchCommand({
      store,
      principal: portal,
      envelope: {
        commandId: "portal-1",
        idempotencyKey: "portal-1",
        principalId: portal.grantId,
        organisationId: portal.organisationId,
        issuedAt: NOW.toISOString(),
        command: portalEvidenceSubmit(question.id, {
          value: "42",
          evidence: {
            filename: "recycled-content.pdf",
            extractedValue: "42",
            confidence: 99,
            scope: { kind: "product", id: requirement.subjectId, label: requirement.subjectLabel },
          },
        }),
      },
      now: NOW,
    });
    expect(outcome.status === "ok" || outcome.status === "ALREADY_PROCESSED").toBe(true);

    const afterAnswer = store.loadEngine("holzwerk");
    const answered = afterAnswer.cases.find((c) => c.id === question.id);
    expect(answered?.state).toBe("READY");
    const evaluation = evaluatePilotRun(afterAnswer, afterAnswer.pilotRuns[0]);
    expect(evaluation.initialMissing).toBe(afterAnswer.pilotRuns[0].baseline.missing);
    expect(evaluation.resolvedSupplierResponse).toBeGreaterThan(0);
  });

  it("does not send a second email on repeated worker execution or duplicate portal submit", async () => {
    const store = new MemoryPersistence();
    const principal = await emptyManufacturerPrincipal(store);
    await createImportJob(store, principal, manufacturerFiles(), NOW);
    await executeResolutionRun(store, principal, NOW);
    const email = new MemoryEmailPort();
    await processOutboxBatch({ store, email, now: NOW });
    const firstCount = email.sent.length;
    await processOutboxBatch({ store, email, now: NOW });
    expect(email.sent).toHaveLength(firstCount);
    const token = email.sent[0].text.match(/\/s\/([A-Za-z0-9_-]+)/)![1];
    const portal = await resolvePortalPrincipal(store, token, NOW);
    const view = await getSupplierPortalView(store, portal);
    const question = view.questions[0];
    await acceptPortalDisclosure(store, portal, question.id, NOW);
    const command = portalEvidenceSubmit(question.id, { value: "42" });
    const first = await dispatchCommand({
      store,
      principal: portal,
      envelope: {
        commandId: "portal-dup-1",
        idempotencyKey: "portal-dup",
        principalId: portal.grantId,
        organisationId: portal.organisationId,
        issuedAt: NOW.toISOString(),
        command,
      },
      now: NOW,
    });
    const replay = await dispatchCommand({
      store,
      principal: portal,
      envelope: {
        commandId: "portal-dup-2",
        idempotencyKey: "portal-dup",
        principalId: portal.grantId,
        organisationId: portal.organisationId,
        issuedAt: NOW.toISOString(),
        command: { ...command, value: "99" },
      },
      now: NOW,
    });
    expect(first.status === "ok" || first.status === "ALREADY_PROCESSED").toBe(true);
    expect(replay.status).toBe("ALREADY_PROCESSED");
  });
});
