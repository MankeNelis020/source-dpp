import { jsonError } from "../../source/_lib";
import { getPersistence, getRuntimeStripeBilling, getSourceEnvironment } from "@/infrastructure/runtime";
import { applyStripeBillingEvent, requireStripeBilling } from "@/server/source/billing";
import { StripeBillingError } from "@/infrastructure/billing/port";
import { SourceError } from "@/server/source/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const env = getSourceEnvironment();
    if (!env.stripeWebhookSecret) {
      return Response.json({ error: "UNAUTHENTICATED", message: "Webhook is not configured." }, { status: 401 });
    }
    const stripe = requireStripeBilling(getRuntimeStripeBilling());
    const payload = await request.text();
    const signature = request.headers.get("stripe-signature") ?? "";
    let event;
    try {
      event = stripe.constructWebhookEvent(payload, signature, env.stripeWebhookSecret);
    } catch (error) {
      if (error instanceof StripeBillingError) {
        return Response.json({ error: "UNAUTHENTICATED", message: "Invalid webhook signature." }, { status: 401 });
      }
      throw error;
    }
    const result = await applyStripeBillingEvent({
      store: getPersistence(),
      stripe,
      event,
      env,
    });
    return Response.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    if (error instanceof SourceError) return jsonError(error);
    return jsonError(error);
  }
}