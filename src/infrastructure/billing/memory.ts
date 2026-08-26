import type {
  StripeBillingEvent,
  StripeBillingPort,
  StripeCheckoutSessionInput,
  StripeCheckoutSessionResult,
  StripePortalSessionInput,
  StripePortalSessionResult,
  StripeSubscriptionSnapshot,
} from "./port";
import { StripeBillingError } from "./port";

export class MemoryStripeBillingAdapter implements StripeBillingPort {
  checkoutSessions: (StripeCheckoutSessionInput & StripeCheckoutSessionResult)[] = [];
  portalSessions: StripePortalSessionInput[] = [];
  subscriptions = new Map<string, StripeSubscriptionSnapshot>();
  failCheckout?: Error;
  failPortal?: Error;

  async createCheckoutSession(input: StripeCheckoutSessionInput): Promise<StripeCheckoutSessionResult> {
    if (this.failCheckout) throw this.failCheckout;
    const id = `cs_test_${this.checkoutSessions.length + 1}`;
    const result = { id, url: `https://checkout.stripe.test/c/pay/${id}` };
    this.checkoutSessions.push({ ...input, ...result });
    return result;
  }

  async createCustomerPortalSession(input: StripePortalSessionInput): Promise<StripePortalSessionResult> {
    if (this.failPortal) throw this.failPortal;
    this.portalSessions.push(input);
    return { url: "https://billing.stripe.test/p/session/test" };
  }

  constructWebhookEvent(payload: string, signature: string, secret: string): StripeBillingEvent {
    if (!secret) throw new StripeBillingError("Webhook is not configured.", 401);
    if (signature !== `test:${secret}`) {
      throw new StripeBillingError("Invalid webhook signature.", 401);
    }
    const parsed = JSON.parse(payload) as StripeBillingEvent;
    if (!parsed.id || !parsed.type) throw new StripeBillingError("Invalid webhook payload.", 400);
    return parsed;
  }

  async retrieveSubscription(subscriptionId: string): Promise<StripeSubscriptionSnapshot | undefined> {
    return this.subscriptions.get(subscriptionId);
  }
}
