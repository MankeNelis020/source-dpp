import { describe, expect, it } from "vitest";
import { emptyState } from "@/domain/source/engine";
import { MemoryPersistence } from "@/infrastructure/database/memory";
import { hashToken } from "@/infrastructure/crypto/tokens";
import { ingestInboundEmail, extractReplyPlusToken, sanitizeInboundText, inboundAttachmentAllowed } from "@/server/source/inbound-email";

const NOW = new Date("2026-08-18T10:00:00.000Z");

describe("inbound email foundation", () => {
  it("extracts an opaque reply-plus token and sanitizes HTML", () => {
    expect(extractReplyPlusToken("reply+abc_DEF-1@mail.example")).toBe("abc_DEF-1");
    expect(extractReplyPlusToken("support@mail.example")).toBeUndefined();
    expect(sanitizeInboundText('<script>alert(1)</script><p>Recycled <b>67%</b></p>')).toBe("Recycled 67%");
    expect(inboundAttachmentAllowed("payload.exe", 12)).toBe(false);
    expect(inboundAttachmentAllowed("coa.pdf", 1200)).toBe(true);
  });

  it("correlates by hashed token, rejects spoofed From as untrusted, and is replay-safe", async () => {
    const store = new MemoryPersistence();
    store.saveEngine("alice-inb", emptyState({ id: "alice-inb", name: "Alice GmbH" }));
    const engine = store.loadEngine("alice-inb");
    engine.cases.push({
      id: "SRC-INB-1",
      requirementId: "req-inb",
      state: "WAITING_RESPONSE",
      nextAction: "Wait",
      escalationPolicyId: "standard_supplier_14d",
      ownerLabel: "SOURCE",
      openedAt: NOW.toISOString(),
      version: 1,
      identityStatus: "IDENTITY_MATCHED",
      automationLevel: "L2",
    });
    engine.contacts.push({
      id: "ct-inb",
      actorId: "supplier-inb",
      role: "compliance",
      name: "Pat",
      email: "pat@supplier.example",
      valid: true,
    });
    store.saveEngine("alice-inb", engine);
    store.saveInboundCorrelation({
      id: "corr-1",
      organisationId: "alice-inb",
      caseId: "SRC-INB-1",
      tokenHash: hashToken("opaque-token"),
      createdAt: NOW.toISOString(),
      expiresAt: "2026-09-01T00:00:00.000Z",
    });

    const spoofed = await ingestInboundEmail({
      store,
      provider: "TEST",
      providerEventId: "inb-1",
      to: "reply+opaque-token@mail.example",
      from: "attacker@evil.example",
      text: "<b>67</b>",
      occurredAt: NOW.toISOString(),
      now: NOW,
    });
    expect(spoofed.duplicate).toBe(false);
    expect(spoofed.disposition).toBe("untrusted");
    const replay = await ingestInboundEmail({
      store,
      provider: "TEST",
      providerEventId: "inb-1",
      to: "reply+opaque-token@mail.example",
      from: "attacker@evil.example",
      text: "67",
      occurredAt: NOW.toISOString(),
      now: NOW,
    });
    expect(replay.duplicate).toBe(true);
    const known = await ingestInboundEmail({
      store,
      provider: "TEST",
      providerEventId: "inb-2",
      to: "reply+opaque-token@mail.example",
      from: "pat@supplier.example",
      html: "<p>See attached</p>",
      occurredAt: NOW.toISOString(),
      now: NOW,
    });
    expect(known.disposition).toBe("stored");
    const state = store.loadEngine("alice-inb");
    expect(state.tasks.some((t) => t.title === "A supplier replied by email")).toBe(true);
    expect(state.cases[0].state).toBe("WAITING_RESPONSE");
  });
});
