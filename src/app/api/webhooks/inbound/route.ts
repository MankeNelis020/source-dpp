import { jsonError } from "../../source/_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { loadSourceEnvironment } from "@/infrastructure/environment/source-environment";
import { ingestInboundEmail, verifyInboundWebhookSignature } from "@/server/source/inbound-email";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const env = loadSourceEnvironment();
    if (!env.inboundWebhookSecret) {
      return Response.json({ error: "UNAUTHENTICATED", message: "Inbound email is not configured." }, { status: 401 });
    }
    const payload = await request.text();
    const valid = verifyInboundWebhookSignature({
      secret: env.inboundWebhookSecret,
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
      data?: {
        email_id?: string;
        to?: string[] | string;
        from?: string;
        text?: string;
        html?: string;
        attachments?: { filename?: string; size?: number }[];
      };
    };
    const to = Array.isArray(body.data?.to) ? body.data?.to[0] : body.data?.to;
    const result = await ingestInboundEmail({
      store: getPersistence(),
      provider: "RESEND",
      providerEventId: request.headers.get("svix-id") ?? `inbound:${body.data?.email_id}:${body.type}`,
      to,
      from: body.data?.from,
      text: body.data?.text,
      html: body.data?.html,
      occurredAt: body.created_at ?? new Date().toISOString(),
      attachments: (body.data?.attachments ?? []).map((file) => ({
        filename: file.filename ?? "attachment",
        sizeBytes: file.size ?? 0,
      })),
    });
    return Response.json({ received: true, duplicate: result.duplicate, disposition: result.disposition });
  } catch (error) {
    return jsonError(error);
  }
}
