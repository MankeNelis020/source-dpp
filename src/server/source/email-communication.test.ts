import { describe, expect, it, vi } from "vitest";
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
import { getCaseDetail, getSupplierPortalView } from "@/server/source/queries";
import { processOutboxBatch } from "@/infrastructure/outbox/processor";
import { ROLE_CAPABILITIES } from "@/server/source/authorization";
import { TestEmailProvider } from "@/infrastructure/email/test-provider";
import { applyProviderDeliveryEvent } from "@/server/source/email-events";
import { semanticReminderKey } from "@/infrastructure/outbox/types";
import { EmailProviderError } from "@/infrastructure/email/port";
import { verifyResendWebhookSignature, signResendWebhookForTests } from "@/infrastructure/email/signature";
import { renderSupplierRequestEmail } from "@/infrastructure/email/templates";
import { createUploadIntent, putUploadBytes, finalizeUpload } from "@/server/source/uploads";
import { createSharedMemoryObjectStorage } from "@/infrastructure/storage/memory";
import { acceptPortalDisclosure, portalEvidenceSubmit } from "@/server/source/portal-disclosure-test";

const NOW = new Date("2026-08-18T10:00:00.000Z");
const FIXTURES = join(process.cwd(), "fixtures/p1-manufacturer");
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);

function manufacturerFiles() {
  return {
    products: readFileSync(join(FIXTURES, "artikelstamm.csv"), "utf8"),
    suppliers: readFileSync(join(FIXTURES, "lieferanten.csv"), "utf8"),
    bom: readFileSync(join(FIXTURES, "stueckliste.csv"), "utf8"),
    materials: readFileSync(join(FIXTURES, "materialien.csv"), "utf8"),
  };
}

async function provision(store: MemoryPersistence, orgId: string, name = "Holzwerk Schmidt GmbH") {
  store.organisations.set(orgId, { id: orgId, name, slug: orgId });
  store.users.set(`user-${orgId}`, { id: `user-${orgId}`, email: `owner@${orgId}.example`, displayName: "Owner" });
  store.memberships.push({
    id: `mem-${orgId}`,
    userId: `user-${orgId}`,
    organisationId: orgId,
    role: "OWNER",
    capabilities: [...ROLE_CAPABILITIES.OWNER],
  });
  store.saveEngine(orgId, emptyState({ id: orgId, name }));
  return resolveUserPrincipal(store, `user-${orgId}`, orgId);
}

describe("email templates", () => {
  it("escapes untrusted organisation names and always includes text plus a portal CTA", () => {
    const rendered = renderSupplierRequestEmail({
      organisationName: `<Acme & Co>`,
      itemCount: 12,
      portalUrl: "https://app.example/s/tok",
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(rendered.html).toContain("&lt;Acme &amp; Co&gt;");
    expect(rendered.html).not.toContain("<Acme");
    expect(rendered.text).toContain("Provide information");
    expect(rendered.text).toContain("We need your help with 12 items.");
    expect(rendered.subject).toContain("<Acme & Co>");
  });
});

describe("webhook signatures", () => {
  it("accepts a valid Svix signature and rejects a spoofed one", () => {
    const secret = "whsec_dGVzdHNlY3JldA==";
    const payload = `{"type":"email.delivered"}`;
    const svixId = "msg_1";
    const svixTimestamp = String(Math.floor(NOW.getTime() / 1000));
    const signature = signResendWebhookForTests({ secret, payload, svixId, svixTimestamp });
    expect(
      verifyResendWebhookSignature({ secret, payload, svixId, svixTimestamp, svixSignature: signature, now: NOW })
    ).toBe(true);
    expect(
      verifyResendWebhookSignature({
        secret,
        payload,
        svixId,
        svixTimestamp,
        svixSignature: "v1,aaaa",
        now: NOW,
      })
    ).toBe(false);
  });
});

describe("PR C communication loop", () => {
  it("queues one grouped email, delivers through TestEmailProvider, and completes readiness with evidence", async () => {
    const storage = createSharedMemoryObjectStorage();
    const store = new MemoryPersistence();
    const principal = await provision(store, "holzwerk-c");
    await createImportJob(store, principal, manufacturerFiles(), NOW, { objectStorage: storage });
    await executeResolutionRun(store, principal, NOW);
    const pending = store.listOutbox("PENDING", "holzwerk-c");
    expect(pending.length).toBeGreaterThan(0);
    const uniqueSuppliers = new Set(pending.map((row) => String(row.payload.supplierActorId)));
    expect(uniqueSuppliers.size).toBe(pending.length);

    const email = new TestEmailProvider();
    const processed = await processOutboxBatch({ store, email, now: NOW });
    expect(processed.succeeded).toBe(pending.length);
    expect(email.sent).toHaveLength(pending.length);
    expect(email.sent[0].text).toContain("/s/");
    const match = email.sent[0].text.match(/\/s\/([A-Za-z0-9_-]+)/);
    const token = match![1];
    expect(JSON.stringify(store.audit)).not.toContain(token);
    expect(store.portalGrants.some((g) => g.tokenHash && !g.tokenHash.includes(token))).toBe(true);

    const portal = await resolvePortalPrincipal(store, token, NOW);
    const view = await getSupplierPortalView(store, portal);
    const question = view.questions[0];
    const intent = await createUploadIntent({
      store,
      principal: portal,
      input: { purpose: "EVIDENCE", filenameHint: "recycled.pdf", caseId: question.id },
      now: NOW,
    });
    await putUploadBytes({
      store,
      principal: portal,
      uploadId: intent.id,
      bytes: PDF,
      filenameHint: "recycled.pdf",
      objectStorage: storage,
      now: NOW,
    });
    const stored = await finalizeUpload({ store, principal: portal, uploadId: intent.id, objectStorage: storage, now: NOW });
    await acceptPortalDisclosure(store, portal, question.id, NOW);
    await dispatchCommand({
      store,
      principal: portal,
      envelope: {
        commandId: "c-portal",
        idempotencyKey: "c-portal",
        principalId: portal.grantId,
        organisationId: portal.organisationId,
        issuedAt: NOW.toISOString(),
        command: portalEvidenceSubmit(question.id, {
          value: "42",
          evidence: { filename: "recycled.pdf", storageObjectId: stored.id },
        }),
      },
      now: NOW,
    });
    const after = store.loadEngine("holzwerk-c");
    expect(after.cases.find((c) => c.id === question.id)?.state).toBe("READY");
    expect(evaluatePilotRun(after, after.pilotRuns[0]).resolvedSupplierResponse).toBeGreaterThan(0);
  });

  it("does not send a duplicate supplier email when the same outbox event is processed twice", async () => {
    const store = new MemoryPersistence();
    store.insertOutbox({
      id: "obx-dup",
      organisationId: "acme",
      eventType: "email.queued",
      aggregateType: "SupplierRequest",
      aggregateId: "SRC-184830",
      semanticKey: "SRC-184830:REQUEST_INITIAL:v1",
      payload: { to: "supplier-b@example.com", subject: "Need", text: "Provide information\nhttps://app.example/s/token" },
      status: "PENDING",
      availableAt: NOW.toISOString(),
      attemptCount: 0,
      createdAt: NOW.toISOString(),
    });
    const email = new TestEmailProvider();
    await processOutboxBatch({ store, email, now: NOW });
    const row = store.getOutbox("obx-dup")!;
    row.status = "PENDING";
    await processOutboxBatch({ store, email, now: NOW });
    expect(email.sent).toHaveLength(1);
  });

  it("allows DAY3 and DAY7 reminders and does not duplicate DAY3", async () => {
    const store = new MemoryPersistence();
    const principal = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    await dispatchCommand({
      store,
      principal,
      envelope: {
        commandId: "d7",
        idempotencyKey: "d7",
        principalId: principal.userId,
        organisationId: "acme",
        issuedAt: NOW.toISOString(),
        command: { type: "SEND_REMINDER", caseId: "SRC-184830" },
      },
      now: NOW,
    });
    store.insertOutbox({
      id: "obx-d3",
      organisationId: "acme",
      eventType: "email.queued",
      aggregateType: "ResolutionCase",
      aggregateId: "SRC-184830",
      semanticKey: semanticReminderKey("SRC-184830", 3),
      payload: { to: "supplier-b@example.com", subject: "Reminder", text: "Please respond." },
      status: "PENDING",
      availableAt: NOW.toISOString(),
      attemptCount: 0,
      createdAt: NOW.toISOString(),
    });
    const email = new TestEmailProvider();
    await processOutboxBatch({ store, email, now: NOW });
    await processOutboxBatch({ store, email, now: NOW });
    const keys = email.sent.map((row) => row.semanticKey).sort();
    expect(keys).toContain(semanticReminderKey("SRC-184830", 3));
    expect(keys.filter((key) => key === semanticReminderKey("SRC-184830", 3))).toHaveLength(1);
  });

  it("treats bounce as a contact problem, not NO_RESPONSE", async () => {
    const store = new MemoryPersistence();
    const engine = store.loadEngine("acme");
    for (const contact of engine.contacts.filter((c) => c.actorId === "supplier-b" && c.id !== "ct-b-gen")) {
      contact.valid = false;
    }
    store.saveEngine("acme", engine);
    const email = new TestEmailProvider();
    store.insertOutbox({
      id: "obx-bounce",
      organisationId: "acme",
      eventType: "email.queued",
      aggregateType: "SupplierRequest",
      aggregateId: "SRC-184830",
      semanticKey: "SRC-184830:REQUEST_INITIAL:v1",
      payload: { to: "info@supplierb.example", supplierActorId: "supplier-b", subject: "Need", text: "Hello" },
      status: "PENDING",
      availableAt: NOW.toISOString(),
      attemptCount: 0,
      createdAt: NOW.toISOString(),
    });
    await processOutboxBatch({ store, email, now: NOW });
    const message = store.getOutboundMessageBySemanticKey("acme", "SRC-184830:REQUEST_INITIAL:v1")!;
    const bounce = await applyProviderDeliveryEvent({
      store,
      provider: "TEST",
      providerEventId: "evt-bounce-1",
      providerMessageId: message.providerMessageId,
      eventType: "email.bounced",
      occurredAt: "2026-08-18T10:05:00.000Z",
      now: NOW,
    });
    expect(bounce.status).toBe("BOUNCED");
    const state = store.loadEngine("acme");
    const resolution = state.cases.find((c) => c.id === "SRC-184830")!;
    expect(resolution.blockingReason).not.toBe("NO_RESPONSE");
    expect(state.tasks.some((t) => t.title.includes("couldn't reach this supplier"))).toBe(true);
    const again = await applyProviderDeliveryEvent({
      store,
      provider: "TEST",
      providerEventId: "evt-bounce-1",
      providerMessageId: message.providerMessageId,
      eventType: "email.bounced",
      occurredAt: "2026-08-18T10:05:00.000Z",
      now: NOW,
    });
    expect(again.duplicate).toBe(true);
  });

  it("does not regress DELIVERED when an older accepted event arrives later", async () => {
    const store = new MemoryPersistence();
    store.insertOutbox({
      id: "obx-oo",
      organisationId: "acme",
      eventType: "email.queued",
      aggregateType: "SupplierRequest",
      aggregateId: "SRC-184821",
      semanticKey: "SRC-184821:REQUEST_INITIAL:v1",
      payload: { to: "info@supplierb.example", subject: "Need", text: "Hello" },
      status: "PENDING",
      availableAt: NOW.toISOString(),
      attemptCount: 0,
      createdAt: NOW.toISOString(),
    });
    const email = new TestEmailProvider();
    await processOutboxBatch({ store, email, now: NOW });
    const message = store.getOutboundMessageBySemanticKey("acme", "SRC-184821:REQUEST_INITIAL:v1")!;
    await applyProviderDeliveryEvent({
      store,
      provider: "TEST",
      providerEventId: "delivered-later",
      providerMessageId: message.providerMessageId,
      eventType: "email.delivered",
      occurredAt: "2026-08-18T10:02:00.000Z",
      now: NOW,
    });
    await applyProviderDeliveryEvent({
      store,
      provider: "TEST",
      providerEventId: "sent-earlier",
      providerMessageId: message.providerMessageId,
      eventType: "email.sent",
      occurredAt: "2026-08-18T10:01:00.000Z",
      now: NOW,
    });
    expect(store.getOutboundMessage(message.id)?.transportStatus).toBe("DELIVERED");
  });

  it("ignores unknown provider events and events for unknown messages", async () => {
    const store = new MemoryPersistence();
    const unknownType = await applyProviderDeliveryEvent({
      store,
      provider: "TEST",
      providerEventId: "opened-1",
      providerMessageId: "no-such-message",
      eventType: "email.opened",
      occurredAt: NOW.toISOString(),
      now: NOW,
    });
    expect(unknownType.duplicate).toBe(false);
    expect(unknownType.status).toBeUndefined();
    const replay = await applyProviderDeliveryEvent({
      store,
      provider: "TEST",
      providerEventId: "opened-1",
      providerMessageId: "no-such-message",
      eventType: "email.opened",
      occurredAt: NOW.toISOString(),
      now: NOW,
    });
    expect(replay.duplicate).toBe(true);
  });

  it("accepts delivered before accepted without regressing later", async () => {
    const store = new MemoryPersistence();
    store.insertOutbox({
      id: "obx-early-del",
      organisationId: "acme",
      eventType: "email.queued",
      aggregateType: "SupplierRequest",
      aggregateId: "SRC-184821",
      semanticKey: "SRC-184821:REQUEST_EARLY:v1",
      payload: { to: "info@supplierb.example", subject: "Need", text: "Hello" },
      status: "PENDING",
      availableAt: NOW.toISOString(),
      attemptCount: 0,
      createdAt: NOW.toISOString(),
    });
    const email = new TestEmailProvider();
    await processOutboxBatch({ store, email, now: NOW });
    const message = store.getOutboundMessageBySemanticKey("acme", "SRC-184821:REQUEST_EARLY:v1")!;
    const delivered = await applyProviderDeliveryEvent({
      store,
      provider: "TEST",
      providerEventId: "early-delivered",
      providerMessageId: message.providerMessageId,
      eventType: "email.delivered",
      occurredAt: NOW.toISOString(),
      now: NOW,
    });
    expect(delivered.status).toBe("DELIVERED");
    const accepted = await applyProviderDeliveryEvent({
      store,
      provider: "TEST",
      providerEventId: "late-accepted",
      providerMessageId: message.providerMessageId,
      eventType: "email.sent",
      occurredAt: NOW.toISOString(),
      now: NOW,
    });
    expect(accepted.status).toBe("DELIVERED");
    const again = await applyProviderDeliveryEvent({
      store,
      provider: "TEST",
      providerEventId: "early-delivered",
      providerMessageId: message.providerMessageId,
      eventType: "email.delivered",
      occurredAt: NOW.toISOString(),
      now: NOW,
    });
    expect(again.duplicate).toBe(true);
  });

  it("stops automatic reminders after a complaint", async () => {
    const store = new MemoryPersistence();
    const principal = await resolveUserPrincipal(store, "user-acme-owner", "acme");
    store.insertOutbox({
      id: "obx-comp",
      organisationId: "acme",
      eventType: "email.queued",
      aggregateType: "SupplierRequest",
      aggregateId: "SRC-184830",
      semanticKey: "SRC-184830:REQUEST_INITIAL:v1",
      payload: { to: "info@supplierb.example", supplierActorId: "supplier-b", subject: "Need", text: "Hello" },
      status: "PENDING",
      availableAt: NOW.toISOString(),
      attemptCount: 0,
      createdAt: NOW.toISOString(),
    });
    const email = new TestEmailProvider();
    await processOutboxBatch({ store, email, now: NOW });
    const message = store.getOutboundMessageBySemanticKey("acme", "SRC-184830:REQUEST_INITIAL:v1")!;
    await applyProviderDeliveryEvent({
      store,
      provider: "TEST",
      providerEventId: "complaint-1",
      providerMessageId: message.providerMessageId,
      eventType: "email.complained",
      occurredAt: NOW.toISOString(),
      now: NOW,
    });
    expect(store.loadEngine("acme").contacts.some((c) => c.doNotContact)).toBe(true);
    const beforeKeys = new Set(store.listOutbox(undefined, "acme").map((row) => row.id));
    await dispatchCommand({
      store,
      principal,
      envelope: {
        commandId: "tick-after-complaint",
        idempotencyKey: "tick-after-complaint",
        principalId: principal.userId,
        organisationId: "acme",
        issuedAt: NOW.toISOString(),
        command: { type: "TICK_NO_RESPONSE", caseId: "SRC-184830" },
      },
      now: new Date("2026-08-21T10:00:00.000Z"),
    });
    const newMail = store.listOutbox(undefined, "acme").filter((row) => !beforeKeys.has(row.id));
    expect(newMail.every((row) => String(row.payload.to) !== "info@supplierb.example")).toBe(true);
    expect(store.loadEngine("acme").tasks.some((t) => t.title.includes("stop emailing"))).toBe(true);
  });

  it("retries a provider timeout without creating a no-response event", async () => {
    const store = new MemoryPersistence();
    store.insertOutbox({
      id: "obx-timeout",
      organisationId: "acme",
      eventType: "email.queued",
      aggregateType: "SupplierRequest",
      aggregateId: "SRC-184830",
      semanticKey: "SRC-184830:REQUEST_INITIAL:v1",
      payload: { to: "info@supplierb.example", subject: "Need", text: "Hello" },
      status: "PENDING",
      availableAt: NOW.toISOString(),
      attemptCount: 0,
      createdAt: NOW.toISOString(),
    });
    const email = new TestEmailProvider();
    email.failWith = new EmailProviderError("ETIMEDOUT", { retryable: true });
    email.failTimes = 1;
    const result = await processOutboxBatch({ store, email, now: NOW });
    expect(result.deadLetters).toHaveLength(0);
    expect(store.getOutbox("obx-timeout")?.status).toBe("FAILED");
    expect(store.loadEngine("acme").events.some((e) => e.type === "request.no_response" && e.timestamp === NOW.toISOString())).toBe(
      false
    );
  });

  it("dead-letters once and opens a transport Needs You task", async () => {
    const store = new MemoryPersistence();
    store.insertOutbox({
      id: "obx-dead",
      organisationId: "acme",
      eventType: "email.queued",
      aggregateType: "ResolutionCase",
      aggregateId: "SRC-184830",
      semanticKey: "SRC-184830:REQUEST_INITIAL:v1",
      payload: { to: "nobody@example.com", supplierActorId: "supplier-b" },
      status: "PENDING",
      availableAt: NOW.toISOString(),
      attemptCount: 0,
      createdAt: NOW.toISOString(),
    });
    const email = new MemoryEmailPort();
    email.failWith = new Error("invalid recipient");
    const first = await processOutboxBatch({ store, email, now: NOW });
    const second = await processOutboxBatch({ store, email, now: NOW });
    expect(first.deadLetters).toContain("obx-dead");
    expect(second.deadLetters).toHaveLength(0);
    const tasks = store.loadEngine("acme").tasks.filter((t) => t.title.includes("couldn't reach this supplier") && t.status === "open");
    expect(tasks).toHaveLength(1);
  });

  it("does not log the raw portal token", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const store = new MemoryPersistence();
    const principal = await provision(store, "holzwerk-log");
    await createImportJob(store, principal, manufacturerFiles(), NOW);
    await executeResolutionRun(store, principal, NOW);
    const email = new TestEmailProvider();
    await processOutboxBatch({ store, email, now: NOW });
    const token = email.sent[0]?.text.match(/\/s\/([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeTruthy();
    const logged = spy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).not.toContain(token);
    expect(logged).not.toContain(`/s/${token}`);
    spy.mockRestore();
  });

  it("keeps Alice from reading Bob's outbound message metadata", async () => {
    const store = new MemoryPersistence();
    const alice = await provision(store, "alice-mail", "Alice GmbH");
    const bob = await provision(store, "bob-mail", "Bob Oy");
    store.saveOutboundMessage({
      id: "omsg-bob",
      organisationId: bob.organisationId,
      caseId: "SRC-BOB",
      outboxEventId: "obx-bob",
      semanticKey: "bob:REQUEST_INITIAL:v1",
      recipient: "secret-bob@example.com",
      fromAddress: "SOURCE <requests@localhost>",
      templateId: "SUPPLIER_REQUEST",
      templateVersion: "v1",
      category: "SUPPLIER_REQUEST",
      provider: "TEST",
      providerMessageId: "prov-bob",
      transportStatus: "DELIVERED",
      createdAt: NOW.toISOString(),
    });
    const leaked = await store.listOutboundMessages(alice.organisationId);
    expect(leaked.some((row) => row.recipient === "secret-bob@example.com")).toBe(false);
    expect(await store.getOutboundMessageBySemanticKey(alice.organisationId, "bob:REQUEST_INITIAL:v1")).toBeUndefined();
  });

  it("hides confidential upstream recipient from manufacturer case delivery", async () => {
    const store = new MemoryPersistence();
    const nordic = await resolveUserPrincipal(store, "user-nordic-owner", "nordic");
    store.saveOutboundMessage({
      id: "omsg-secret",
      organisationId: "nordic",
      caseId: "SRC-N-1",
      supplierActorId: "mill-private",
      outboxEventId: "obx-secret",
      semanticKey: "SRC-N-1:UPSTREAM:mill-private:v1",
      recipient: "secret-y@example.com",
      fromAddress: "SOURCE <requests@localhost>",
      templateId: "UPSTREAM",
      templateVersion: "v1",
      category: "SUPPLIER_UPSTREAM",
      provider: "TEST",
      providerMessageId: "prov-secret",
      transportStatus: "DELIVERED",
      deliveredAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
    });
    const detail = await getCaseDetail(store, nordic, "SRC-N-1");
    const blob = JSON.stringify(detail);
    expect(blob).not.toContain("secret-y@example.com");
    expect(detail.delivery?.label).toMatch(/verified upstream source/i);
  });
});
