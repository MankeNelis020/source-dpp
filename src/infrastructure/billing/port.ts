/**
 * Stripe lives in infrastructure only. Domain and React must not import the Stripe SDK.
 */

export interface StripeCheckoutSessionInput {
  organisationId: string;
  planId: string;
  priceId: string;
  customerEmail: string;
  customerId?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface StripeCheckoutSessionResult {
  id: string;
  url: string;
}

export interface StripePortalSessionInput {
  customerId: string;
  returnUrl: string;
}

export interface StripePortalSessionResult {
  url: string;
}

export interface StripeBillingEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface StripeSubscriptionSnapshot {
  id: string;
  customerId: string;
  status: string;
  priceId?: string;
  currentPeriodEnd?: string;
}

export interface StripeBillingPort {
  createCheckoutSession(input: StripeCheckoutSessionInput): Promise<StripeCheckoutSessionResult>;
  createCustomerPortalSession(input: StripePortalSessionInput): Promise<StripePortalSessionResult>;
  constructWebhookEvent(payload: string, signature: string, secret: string): StripeBillingEvent;
  retrieveSubscription(subscriptionId: string): Promise<StripeSubscriptionSnapshot | undefined>;
}

export class StripeBillingError extends Error {
  constructor(
    message: string,
    readonly httpStatus = 502
  ) {
    super(message);
    this.name = "StripeBillingError";
  }
}
