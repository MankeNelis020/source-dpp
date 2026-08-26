import Stripe from "stripe";
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
import { snapshotStripeSubscription } from "./snapshot";

export class LiveStripeBillingAdapter implements StripeBillingPort {
  private readonly stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  async createCheckoutSession(input: StripeCheckoutSessionInput): Promise<StripeCheckoutSessionResult> {
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.organisationId,
      customer: input.customerId,
      customer_email: input.customerId ? undefined : input.customerEmail,
      allow_promotion_codes: true,
      metadata: {
        organisationId: input.organisationId,
        planId: input.planId,
      },
      subscription_data: {
        metadata: {
          organisationId: input.organisationId,
          planId: input.planId,
        },
      },
    });
    if (!session.url) {
      throw new StripeBillingError("Checkout is unavailable.");
    }
    return { id: session.id, url: session.url };
  }

  async createCustomerPortalSession(input: StripePortalSessionInput): Promise<StripePortalSessionResult> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    if (!session.url) {
      throw new StripeBillingError("Billing portal is unavailable.");
    }
    return { url: session.url };
  }

  constructWebhookEvent(payload: string, signature: string, secret: string): StripeBillingEvent {
    try {
      const event = this.stripe.webhooks.constructEvent(payload, signature, secret);
      return {
        id: event.id,
        type: event.type,
        data: { object: event.data.object as unknown as Record<string, unknown> },
      };
    } catch {
      throw new StripeBillingError("Invalid webhook signature.", 401);
    }
  }

  async retrieveSubscription(subscriptionId: string): Promise<StripeSubscriptionSnapshot | undefined> {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    return snapshotStripeSubscription(subscription as unknown as Record<string, unknown>);
  }
}
