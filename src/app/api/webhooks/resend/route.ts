import { jsonError } from "../../source/_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { loadSourceEnvironment } from "@/infrastructure/environment/source-environment";
import { verifyResendWebhookSignature } from "@/infrastructure/email/signature";
import { applyProviderDeliveryEvent } from "@/server/source/email-events";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const env = loadSourceEnvironment();
    if (!env.resendWebhookSecret) {
      return Response.json({ error: "UNAUTHENTICATED", message: "Webhook is not configured." }, { status: 401 });
    }
    const payload = await request.text();
    const valid = verifyResendWebhookSignature({
      secret: env.resendWebhookSecret,
      payload,
      svixId: request.headers.get("svix-id") ?? "",
      svixTimestamp: request.headers.get("svix-timestamp") ?? "",
      svixSignature: request.headers.get("svix-signature") ?? "",
    });
    if (!valid) {
      return Response.json({ error: "UNAUTHENTICATED", message: "Invalid webhook signature." }, { status: 401 });
    }
    const body = JSON.parse(payload) as {
      type?: string;
      created_at?: string;
      data?: { email_id?: string; created_at?: string };
    };
    const result = await applyProviderDeliveryEvent({
      store: getPersistence(),
      provider: "RESEND",
      providerEventId: request.headers.get("svix-id") ?? `resend:${body.data?.email_id}:${body.type}`,
      providerMessageId: body.data?.email_id,
      eventType: body.type ?? "",
      occurredAt: body.data?.created_at ?? body.created_at ?? new Date().toISOString(),
    });
    return Response.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    return jsonError(error);
  }
}
