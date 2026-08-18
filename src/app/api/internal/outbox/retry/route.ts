import { jsonError } from "../../../source/_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { requireCronSecret } from "@/server/source/cron-auth";
import { SourceError } from "@/server/source/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireCronSecret(request);
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    if (!body.id) throw new SourceError("VALIDATION", "Dead-letter id is required.", 400);
    const store = getPersistence();
    const existing = await store.getOutbox(body.id);
    if (!existing) throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
    const ok = await store.resetOutboxForRetry(body.id, new Date());
    if (!ok) throw new SourceError("VALIDATION", "Only dead-lettered messages can be retried.", 400);
    await store.appendAudit({
      id: store.nextId("aud"),
      organisationId: existing.organisationId,
      principalId: "SOURCE_SYSTEM",
      action: "OUTBOX_DEAD_LETTER_RETRY",
      resourceType: "OutboxEvent",
      resourceId: existing.id,
      result: "success",
      publicContext: { semanticKey: existing.semanticKey },
      createdAt: new Date().toISOString(),
      policyVersion: "prc-v1",
    });
    return Response.json({ retried: true, id: existing.id });
  } catch (error) {
    return jsonError(error);
  }
}
