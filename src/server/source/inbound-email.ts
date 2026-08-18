import { createHash } from "node:crypto";
import { hashToken } from "@/infrastructure/crypto/tokens";
import { verifyResendWebhookSignature } from "@/infrastructure/email/signature";
import { normalizeEmail } from "@/infrastructure/email/validate";
import type { PersistencePort } from "@/infrastructure/database/ports";
import type { InboundEmailEventRecord } from "@/infrastructure/email/transport";
import { logOperational } from "@/infrastructure/observability/metrics";

const MAX_TEXT_CHARS = 20_000;
const EXECUTABLE_NAME = /\.(exe|dll|bat|cmd|com|msi|scr|js|vbs|ps1|sh|bin)$/i;

export function extractReplyPlusToken(address: string | undefined): string | undefined {
  if (!address) return undefined;
  const local = address.split("@")[0] ?? "";
  const match = local.match(/^reply\+([A-Za-z0-9_-]+)$/i);
  return match?.[1];
}

export function sanitizeInboundText(input: string | undefined): string {
  const raw = (input ?? "").slice(0, MAX_TEXT_CHARS);
  return raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inboundAttachmentAllowed(filename: string, sizeBytes: number) {
  if (sizeBytes <= 0 || sizeBytes > 10 * 1024 * 1024) return false;
  if (EXECUTABLE_NAME.test(filename)) return false;
  return /\.(pdf|csv|png|jpe?g|txt)$/i.test(filename);
}

export function verifyInboundWebhookSignature(args: {
  secret: string;
  payload: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  now?: Date;
}): boolean {
  return verifyResendWebhookSignature(args);
}

export async function ingestInboundEmail(args: {
  store: PersistencePort;
  provider: string;
  providerEventId: string;
  to?: string;
  from?: string;
  text?: string;
  html?: string;
  occurredAt: string;
  attachments?: { filename: string; sizeBytes: number }[];
  now?: Date;
}): Promise<{ duplicate: boolean; disposition: InboundEmailEventRecord["disposition"] }> {
  const now = args.now ?? new Date();
  const fromNormalized = normalizeEmail(args.from) ?? undefined;
  const token = extractReplyPlusToken(args.to);
  const correlation = token ? await args.store.findInboundCorrelationByTokenHash(hashToken(token)) : undefined;
  const expired = correlation ? new Date(correlation.expiresAt).getTime() <= now.getTime() : false;

  let disposition: InboundEmailEventRecord["disposition"] = "ignored";
  if (!correlation || expired) disposition = "unknown_correlation";
  else disposition = "stored";

  if (correlation && fromNormalized) {
    const state = await args.store.loadEngine(correlation.organisationId);
    const known = state.contacts.some(
      (contact) => contact.actorId && normalizeEmail(contact.email) === fromNormalized
    );
    if (!known) disposition = "untrusted";
  }

  const inserted = await args.store.insertInboundEmailEvent({
    id: args.store.nextId("inb"),
    provider: args.provider,
    providerEventId: args.providerEventId,
    organisationId: correlation?.organisationId,
    caseId: correlation?.caseId,
    correlationId: correlation?.id,
    fromNormalized,
    occurredAt: args.occurredAt,
    processedAt: now.toISOString(),
    disposition,
  });
  if (!inserted) return { duplicate: true, disposition: "duplicate" };

  const text = sanitizeInboundText(args.text || args.html);
  void text;
  const unsafe = (args.attachments ?? []).filter((file) => !inboundAttachmentAllowed(file.filename, file.sizeBytes));
  logOperational("email.inbound_received", {
    provider: args.provider,
    disposition,
    hasCorrelation: Boolean(correlation),
    attachmentCount: args.attachments?.length ?? 0,
    rejectedAttachments: unsafe.length,
    bodyChars: text.length,
    bodyHash: text ? createHash("sha256").update(text).digest("hex").slice(0, 16) : undefined,
  });

  if (correlation && (disposition === "stored" || disposition === "untrusted")) {
    const state = await args.store.loadEngine(correlation.organisationId);
    const already = state.tasks.some(
      (task) => task.caseId === correlation.caseId && task.title === "A supplier replied by email" && task.status === "open"
    );
    if (!already && state.cases.some((item) => item.id === correlation.caseId)) {
      state.tasks.push({
        id: args.store.nextId("task"),
        caseId: correlation.caseId,
        title: "A supplier replied by email",
        context:
          disposition === "untrusted"
            ? "An inbound message matched this request, but the From address is not a known contact. SOURCE did not treat it as evidence."
            : "An inbound message matched this request. SOURCE did not auto-accept it as evidence. Review the portal or add the file explicitly.",
        recommendedAction: "Open the supplier portal request or upload evidence yourself.",
        ownerLabel: "Account owner",
        status: "open",
        createdAt: now.toISOString(),
        kind: "review",
      });
      await args.store.saveEngine(correlation.organisationId, state);
    }
  }

  return { duplicate: false, disposition };
}
