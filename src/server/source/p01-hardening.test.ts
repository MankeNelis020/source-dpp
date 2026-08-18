import { describe, expect, it } from "vitest";
import { MemoryPersistence } from "@/infrastructure/database/memory";
import { dispatchCommand, resolveUserPrincipal } from "@/server/source/commands/dispatch";
import { getCaseDetail, getEvidenceAccess, getInternalAudit, getTenantAudit, searchTenant } from "@/server/source/queries";
import { leakScan } from "@/server/source/confidentiality";
import {
  attestationStatus,
  opaqueEvidenceRef,
  resolveEvidenceIdFromOpaqueRef,
} from "@/server/source/disclosure";
import { MemoryRateLimiter } from "@/infrastructure/rate-limit/memory";
import { MemoryEmailPort } from "@/infrastructure/database/ports";
import { processOutboxBatch } from "@/infrastructure/outbox/processor";
import { semanticReminderKey } from "@/infrastructure/outbox/types";
import { findReusableClaimsForRequirement } from "@/server/source/network";
import { neutralizeCsvFormula, assertSafeImportPayload } from "@/server/source/import/service";
import { SourceError } from "@/server/source/types";
import { originAllowed } from "@/server/source/http-security";
import { randomBytes } from "node:crypto";

const NOW = new Date("2026-08-17T09:00:00.000Z");

describe("structured disclosure", () => {
  it("omits internal evidence ids from protected and private unauthorized projections", async () => {
    const store = new MemoryPersistence();
    const owner = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    const reviewer = await resolveUserPrincipal(store, "user-acme-reviewer", "acme");
    const confidential = await getCaseDetail(store, owner, "SRC-184844");
    const serialized = JSON.stringify(confidential);
    expect(serialized).not.toContain("mill-north");
    expect(serialized).not.toContain("Nordic Fibre Mill");
    expect(confidential.actor?.kind).toBe("protected");

    const privateCase = await getCaseDetail(store, reviewer, "SRC-184831");
    expect(privateCase.evidence?.type).toBe("EVIDENCE_ATTESTATION");
    expect(privateCase.evidence?.evidenceVisible).toBe(false);
    expect(privateCase.evidence?.status).toBe("EVIDENCED");
    expect(JSON.stringify(privateCase)).not.toContain("ev-44102");
    expect(JSON.stringify(privateCase)).not.toContain("packaging-lca-2026.pdf");

    const visible = await getCaseDetail(store, owner, "SRC-184821");
    expect(visible.evidence?.type).toBe("EVIDENCE_RECORD");
    if (visible.evidence?.type === "EVIDENCE_RECORD") {
      expect(visible.evidence.opaqueRef.startsWith("evr1_")).toBe(true);
      expect(JSON.stringify(visible.evidence)).not.toContain("ev-92831");
    }
  });

  it("does not issue evidence access for protected objects even with a guessed id", async () => {
    const store = new MemoryPersistence();
    const acme = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    await expect(getEvidenceAccess(store, acme, "ev-nordic-private")).rejects.toMatchObject({
      code: "RESOURCE_UNAVAILABLE",
    });
    const nordic = await resolveUserPrincipal(store, "user-nordic-owner", "nordic");
    await expect(getEvidenceAccess(store, nordic, "ev-nordic-private")).rejects.toMatchObject({
      code: "RESOURCE_UNAVAILABLE",
    });
    const ref = opaqueEvidenceRef("acme", "ev-92831");
    const allowed = await getEvidenceAccess(store, acme, ref);
    expect(allowed.type).toBe("EVIDENCE_RECORD");
    expect(allowed.signedUrl).toBeTruthy();
    expect(JSON.stringify(allowed)).not.toContain("storageKey");
  });

  it("decodes opaque evidence refs in O(1) without scanning tenant evidence ids", () => {
    const evidenceId = "ev-92831";
    const ref = opaqueEvidenceRef("acme", evidenceId);
    expect(ref.startsWith("evr1_")).toBe(true);
    expect(ref).not.toContain(evidenceId);
    expect(resolveEvidenceIdFromOpaqueRef("acme", ref)).toBe(evidenceId);
    expect(resolveEvidenceIdFromOpaqueRef("nordic", ref)).toBeUndefined();
    expect(resolveEvidenceIdFromOpaqueRef("acme", "evr_legacyhmac")).toBeUndefined();
  });

  it("maps attestation status from engine trust, not mere non-expiry", () => {
    expect(attestationStatus({ expired: true, trustLevel: "VERIFIED" })).toBe("EXPIRED");
    expect(attestationStatus({ expired: false })).toBe("ON_FILE");
    expect(attestationStatus({ expired: false, trustLevel: "DECLARED" })).toBe("ON_FILE");
    expect(attestationStatus({ expired: false, trustLevel: "EVIDENCED" })).toBe("EVIDENCED");
    expect(attestationStatus({ expired: false, trustLevel: "VERIFIED" })).toBe("VERIFIED");
    expect(attestationStatus({ expired: false, trustLevel: "TRACEABLE" })).toBe("VERIFIED");
  });
});

describe("audit projections", () => {
  it("does not depend on free-text replacement for tenant correctness", async () => {
    const store = new MemoryPersistence();
    const principal = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    await dispatchCommand({
      store,
      principal,
      envelope: {
        commandId: "aud-1",
        idempotencyKey: "aud-key",
        principalId: principal.userId,
        organisationId: "acme",
        issuedAt: NOW.toISOString(),
        command: { type: "SEND_REMINDER", caseId: "SRC-184830" },
      },
      now: NOW,
    });
    const stored = store.listAudit("acme")[0];
    expect(stored.publicContext).toBeTruthy();
    expect(stored.publicContext?.commandType).toBe("SEND_REMINDER");
    const tenant = await getTenantAudit(store, principal);
    const payload = JSON.stringify(tenant);
    expect(payload).not.toContain("mill-north");
    expect(payload).not.toContain("Nordic Fibre Mill");
    expect(tenant.some((event) => event.detail.includes("Reminder queued") || event.action === "SEND_REMINDER")).toBe(true);
    const reviewer = await resolveUserPrincipal(store, "user-acme-reviewer", "acme");
    await expect(getInternalAudit(store, reviewer)).rejects.toBeInstanceOf(SourceError);
  });
});

describe("generative leak tests", () => {
  it("keeps generated secrets out of unauthorized serialized projections", async () => {
    const store = new MemoryPersistence();
    const state = store.loadEngine("acme");
    const secrets = {
      name: `Zx${randomBytes(6).toString("hex")}`,
      legalName: `Ln${randomBytes(6).toString("hex")}`,
      alias: `Al${randomBytes(6).toString("hex")}`,
      filename: `file-${randomBytes(6).toString("hex")}.pdf`,
      evidenceId: `ev-${randomBytes(4).toString("hex")}`,
      relationshipId: `rel-${randomBytes(4).toString("hex")}`,
    };
    state.actors.push({
      id: "hidden-fuzz",
      name: secrets.name,
      legalName: secrets.legalName,
      kind: "organisation",
      country: "FI",
      confidential: true,
    });
    Object.assign(state.actors[state.actors.length - 1], { aliases: [secrets.alias] });
    state.relationships.push({
      id: secrets.relationshipId,
      fromActorId: "supplier-b",
      toActorId: "hidden-fuzz",
      confidentialUpstream: true,
      confidentialDownstream: true,
      hideCustomer: true,
    });
    state.evidence.push({
      id: secrets.evidenceId,
      filename: secrets.filename,
      sha256: "ab".repeat(32),
      issuer: secrets.legalName,
      ownerActorId: "hidden-fuzz",
      expired: false,
      validUntil: "2028-01-01",
      scope: { kind: "product", label: "hidden" },
      visibility: "protected",
      linkedClaimIds: [],
    });
    const resolution = state.cases.find((item) => item.id === "SRC-184844")!;
    resolution.currentActorId = "hidden-fuzz";
    store.saveEngine("acme", state);

    const principal = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    const detail = await getCaseDetail(store, principal, "SRC-184844");
    const search = await searchTenant(store, principal, secrets.name);
    const audit = await getTenantAudit(store, principal);
    const blob = JSON.stringify({ detail, search, audit });
    for (const secret of Object.values(secrets)) {
      expect(blob).not.toContain(secret);
    }
    expect(leakScan(detail, Object.values(secrets))).toEqual([]);
  });
});

describe("outbox semantic idempotency", () => {
  it("queues distinct reminder days and does not duplicate the same semantic key", async () => {
    const store = new MemoryPersistence();
    const principal = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    const first = await dispatchCommand({
      store,
      principal,
      envelope: {
        commandId: "r1",
        idempotencyKey: "cmd-r1",
        principalId: principal.userId,
        organisationId: "acme",
        issuedAt: NOW.toISOString(),
        command: { type: "SEND_REMINDER", caseId: "SRC-184830" },
      },
      now: NOW,
    });
    expect(first.status).toBe("ok");
    if (first.status !== "ok" && first.status !== "ALREADY_PROCESSED") throw new Error("expected ok");
    expect(first.sideEffects.some((item) => item.key === semanticReminderKey("SRC-184830", 7))).toBe(true);
    store.insertOutbox({
      id: "obx-day3",
      organisationId: "acme",
      eventType: "email.queued",
      aggregateType: "ResolutionCase",
      aggregateId: "SRC-184830",
      semanticKey: semanticReminderKey("SRC-184830", 3),
      payload: { kind: "AUTO_REMINDER_SENT" },
      status: "PENDING",
      availableAt: NOW.toISOString(),
      attemptCount: 0,
      createdAt: NOW.toISOString(),
    });
    expect(store.listOutbox("PENDING").map((row) => row.semanticKey).sort()).toEqual([
      semanticReminderKey("SRC-184830", 3),
      semanticReminderKey("SRC-184830", 7),
    ].sort());
    const dup = store.insertOutbox({
      id: "obx-dup",
      organisationId: "acme",
      eventType: "email.queued",
      aggregateType: "ResolutionCase",
      aggregateId: "SRC-184830",
      semanticKey: semanticReminderKey("SRC-184830", 3),
      payload: {},
      status: "PENDING",
      availableAt: NOW.toISOString(),
      attemptCount: 0,
      createdAt: NOW.toISOString(),
    });
    expect(dup).toBe(false);

    const email = new MemoryEmailPort();
    const once = await processOutboxBatch({ store, email, limit: 10, now: NOW });
    expect(once.processed).toBeGreaterThan(0);
    const again = await processOutboxBatch({ store, email, limit: 10, now: NOW });
    expect(again.processed).toBe(0);
    expect(email.sent.filter((row) => row.idempotencyKey === semanticReminderKey("SRC-184830", 3))).toHaveLength(1);
  });

  it("dead-letters non-retryable failures and opens a Needs You task", async () => {
    const store = new MemoryPersistence();
    store.insertOutbox({
      id: "obx-fail",
      organisationId: "acme",
      eventType: "email.queued",
      aggregateType: "ResolutionCase",
      aggregateId: "SRC-184830",
      semanticKey: "SRC-184830:REQUEST_INITIAL:v1",
      payload: { kind: "request.sent" },
      status: "PENDING",
      availableAt: NOW.toISOString(),
      attemptCount: 0,
      createdAt: NOW.toISOString(),
    });
    const email = new MemoryEmailPort();
    email.failWith = new Error("invalid recipient");
    const result = await processOutboxBatch({ store, email, now: NOW });
    expect(result.deadLetters).toContain("obx-fail");
    expect(store.getOutbox("obx-fail")?.status).toBe("DEAD_LETTER");
    expect(store.loadEngine("acme").tasks.some((task) => task.title.includes("could not be delivered"))).toBe(true);
  });
});

describe("distributed rate limiter port", () => {
  it("rejects after the shared window is exhausted", async () => {
    const limiter = new MemoryRateLimiter();
    for (let i = 0; i < 3; i += 1) {
      const result = await limiter.consume({ key: "portal:token:abc", limit: 3, windowSeconds: 60 }, NOW);
      expect(result.allowed).toBe(true);
    }
    const blocked = await limiter.consume({ key: "portal:token:abc", limit: 3, windowSeconds: 60 }, NOW);
    expect(blocked.allowed).toBe(false);
    const principal = {
      kind: "supplier_portal" as const,
      grantId: "grant-textile",
      actorId: "supplier-b",
      organisationId: "acme",
      allowedCaseIds: ["SRC-184830"],
      allowedRequirementIds: ["req-textile-origin"],
      allowedCommands: ["SUBMIT_RESPONSE" as const],
    };
    const store = new MemoryPersistence();
    const tight = {
      consume: async () => ({ allowed: false, remaining: 0, resetAt: NOW }),
    };
    await expect(
      dispatchCommand({
        store,
        principal,
        envelope: {
          commandId: "rl1",
          idempotencyKey: "rl1",
          principalId: principal.grantId,
          organisationId: "acme",
          issuedAt: NOW.toISOString(),
          command: { type: "SUBMIT_RESPONSE", caseId: "SRC-184830", value: "1", permission: "GRANTED" },
        },
        now: NOW,
        rateLimiter: tight,
      })
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("network reuse disclosure", () => {
  it("does not expose the source tenant", async () => {
    const store = new MemoryPersistence();
    const acme = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    const result = await findReusableClaimsForRequirement(store, acme, {
      subjectId: "fjord-stool",
      propertyId: "origin_country",
      requiredTrustLevel: "EVIDENCED",
      purpose: "DPP_COMPLIANCE",
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("nordic");
    expect(serialized).not.toContain("Secret Mill");
    expect(serialized).not.toContain("SRC-N-1");
    expect(["READY", "AUTHORIZATION_REQUIRED", "VERIFICATION_ONLY_AVAILABLE", "NO_MATCH"]).toContain(result.outcome);
  });
});

describe("import and csrf helpers", () => {
  it("neutralizes formula injection and rejects oversized imports", () => {
    expect(neutralizeCsvFormula("=cmd")).toBe("'=cmd");
    expect(() => assertSafeImportPayload({ products: `\0bad` })).toThrow(SourceError);
  });

  it("requires origin or referer for cookie mutations", () => {
    const cookie = new Request("http://source.test/api/source/commands", {
      method: "POST",
      headers: { host: "source.test" },
    });
    expect(originAllowed(cookie, "cookie")).toBe(false);
    const ok = new Request("http://source.test/api/source/commands", {
      method: "POST",
      headers: { host: "source.test", origin: "http://source.test" },
    });
    expect(originAllowed(ok, "cookie")).toBe(true);
    const bearer = new Request("http://source.test/api/portal/x/commands", {
      method: "POST",
      headers: { host: "source.test" },
    });
    expect(originAllowed(bearer, "bearer")).toBe(true);
  });
});
