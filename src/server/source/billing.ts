import {
  BILLING_PLANS,
  billingPlanById,
  billingPlanByPriceId,
  checkoutPriceId,
  parseBillingPlanId,
  type BillingPlan,
  type BillingPlanId,
} from "@/domain/billing/plans";
import type { PersistencePort, OrganisationBillingStatus } from "@/infrastructure/database/ports";
import type { SourceEnvironment } from "@/infrastructure/environment/source-environment";
import type { StripeBillingEvent, StripeBillingPort } from "@/infrastructure/billing/port";
import { snapshotStripeSubscription, stripeMetadataValue } from "@/infrastructure/billing/snapshot";
import { trustedAppOrigin } from "@/infrastructure/email/origin";
import { hasCapability } from "@/server/source/authorization";
import { SourceError, type Principal } from "@/server/source/types";

export function resolveBillingPlan(planId: BillingPlanId, env: SourceEnvironment): BillingPlan {
  const plan = billingPlanById(planId);
  const override = planId === "enterprise" ? undefined : env.stripePriceOverrides?.[planId];
  return override ? { ...plan, stripePriceId: override } : plan;
}

export function catalogForEnvironment(env: SourceEnvironment): BillingPlan[] {
  return BILLING_PLANS.map((plan) => resolveBillingPlan(plan.id, env));
}

export async function startCheckoutSession(args: {
  store: PersistencePort;
  stripe: StripeBillingPort;
  env: SourceEnvironment;
  principal: Principal;
  email: string;
  planId: string;
}): Promise<{ url: string }> {
  if (!hasCapability(args.principal, "organisation:manage")) {
    throw new SourceError("FORBIDDEN", "You cannot perform this action.", 403);
  }
  const planId = parseBillingPlanId(args.planId);
  if (!planId) {
    throw new SourceError("VALIDATION", "Unknown plan.", 400);
  }
  const plan = resolveBillingPlan(planId, args.env);
  const priceId = checkoutPriceId(plan);
  if (!priceId) {
    throw new SourceError("VALIDATION", "This plan is not available for self-serve checkout.", 400);
  }
  const origin = trustedAppOrigin(args.env);
  const existing = await args.store.getOrganisationBilling(args.principal.organisationId);
  try {
    const session = await args.stripe.createCheckoutSession({
      organisationId: args.principal.organisationId,
      planId: plan.id,
      priceId,
      customerEmail: args.email,
      customerId: existing?.stripeCustomerId,
      successUrl: `${origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/pricing`,
    });
    return { url: session.url };
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError("SOURCE_UNAVAILABLE", "Checkout is unavailable.", 503);
  }
}

export async function startCustomerPortalSession(args: {
  store: PersistencePort;
  stripe: StripeBillingPort;
  env: SourceEnvironment;
  principal: Principal;
}): Promise<{ url: string }> {
  if (!hasCapability(args.principal, "organisation:manage")) {
    throw new SourceError("FORBIDDEN", "You cannot perform this action.", 403);
  }
  const existing = await args.store.getOrganisationBilling(args.principal.organisationId);
  if (!existing?.stripeCustomerId) {
    throw new SourceError("VALIDATION", "No billing account yet.", 400);
  }
  const origin = trustedAppOrigin(args.env);
  try {
    return await args.stripe.createCustomerPortalSession({
      customerId: existing.stripeCustomerId,
      returnUrl: `${origin}/app/settings`,
    });
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError("SOURCE_UNAVAILABLE", "Billing portal is unavailable.", 503);
  }
}

export async function organisationBillingStatus(args: {
  store: PersistencePort;
  principal: Principal;
  billingConfigured: boolean;
}) {
  const record = await args.store.getOrganisationBilling(args.principal.organisationId);
  const planId = parseBillingPlanId(record?.planId) ?? "free";
  const plan = billingPlanById(planId);
  return {
    configured: args.billingConfigured,
    planId: plan.id,
    planName: plan.name,
    priceLabel: plan.priceLabel,
    status: record?.status ?? "none",
    currentPeriodEnd: record?.currentPeriodEnd ?? null,
    hasCustomer: Boolean(record?.stripeCustomerId),
    canManage: hasCapability(args.principal, "organisation:manage"),
  };
}

export async function applyStripeBillingEvent(args: {
  store: PersistencePort;
  stripe: StripeBillingPort;
  event: StripeBillingEvent;
  env?: SourceEnvironment;
  now?: Date;
}): Promise<{ duplicate: boolean }> {
  const now = args.now ?? new Date();
  const inserted = await args.store.insertStripeWebhookEvent(args.event.id, args.event.type, now);
  if (!inserted) return { duplicate: true };
  try {
    await persistStripeEvent(args.store, args.stripe, args.event, now, args.env);
    return { duplicate: false };
  } catch (error) {
    await args.store.deleteStripeWebhookEvent(args.event.id);
    throw error;
  }
}

function planIdFromPrice(priceId: string | undefined, env?: SourceEnvironment): BillingPlanId | undefined {
  if (!priceId) return undefined;
  const direct = billingPlanByPriceId(priceId);
  if (direct) return direct.id;
  if (!env?.stripePriceOverrides) return undefined;
  for (const [id, override] of Object.entries(env.stripePriceOverrides)) {
    if (override === priceId) return parseBillingPlanId(id);
  }
  return undefined;
}

async function persistStripeEvent(
  store: PersistencePort,
  stripe: StripeBillingPort,
  event: StripeBillingEvent,
  now: Date,
  env?: SourceEnvironment
) {
  if (event.type === "checkout.session.completed") {
    await applyCheckoutCompleted(store, stripe, event.data.object, now, env);
    return;
  }
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await applySubscription(store, event.data.object, event.type, now, env);
  }
}

async function applyCheckoutCompleted(
  store: PersistencePort,
  stripe: StripeBillingPort,
  object: Record<string, unknown>,
  now: Date,
  env?: SourceEnvironment
) {
  if (object.mode && object.mode !== "subscription") return;
  const organisationId =
    stripeMetadataValue(object, "organisationId") ??
    (typeof object.client_reference_id === "string" ? object.client_reference_id : undefined);
  const customerId = asStripeId(object.customer);
  const subscriptionId = asStripeId(object.subscription);
  if (!organisationId || !customerId) return;
  const organisation = await store.getOrganisation(organisationId);
  if (!organisation) return;
  let snapshot = subscriptionId ? await stripe.retrieveSubscription(subscriptionId) : undefined;
  if (!snapshot && object.subscription && typeof object.subscription === "object") {
    snapshot = snapshotStripeSubscription(object.subscription as Record<string, unknown>);
  }
  const planId =
    parseBillingPlanId(stripeMetadataValue(object, "planId")) ??
    planIdFromPrice(snapshot?.priceId, env) ??
    "core";
  await store.saveOrganisationBilling({
    organisationId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: snapshot?.id ?? subscriptionId,
    planId,
    status: mapStripeStatus(snapshot?.status ?? "active"),
    priceId: snapshot?.priceId,
    currentPeriodEnd: snapshot?.currentPeriodEnd,
    updatedAt: now.toISOString(),
  });
}

async function applySubscription(
  store: PersistencePort,
  object: Record<string, unknown>,
  eventType: string,
  now: Date,
  env?: SourceEnvironment
) {
  const snapshot = snapshotStripeSubscription(object);
  if (!snapshot) return;
  const existing = await store.findOrganisationBillingByCustomer(snapshot.customerId);
  const organisationId = existing?.organisationId ?? stripeMetadataValue(object, "organisationId");
  if (!organisationId) return;
  const organisation = await store.getOrganisation(organisationId);
  if (!organisation) return;
  const canceled = eventType === "customer.subscription.deleted";
  const fromPrice = canceled ? undefined : planIdFromPrice(snapshot.priceId, env);
  const existingPlan = parseBillingPlanId(existing?.planId);
  const planId = canceled ? "free" : fromPrice ?? existingPlan ?? "core";
  await store.saveOrganisationBilling({
    organisationId,
    stripeCustomerId: snapshot.customerId,
    stripeSubscriptionId: canceled ? undefined : snapshot.id,
    planId,
    status: canceled ? "canceled" : mapStripeStatus(snapshot.status),
    priceId: canceled ? undefined : snapshot.priceId,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    updatedAt: now.toISOString(),
  });
}

function mapStripeStatus(status: string): OrganisationBillingStatus {
  switch (status) {
    case "incomplete":
    case "incomplete_expired":
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "unpaid":
    case "paused":
    case "none":
      return status;
    default:
      return "incomplete";
  }
}

function asStripeId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && "id" in value && typeof (value as { id: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return undefined;
}

export function requireStripeBilling(stripe: StripeBillingPort | undefined): StripeBillingPort {
  if (!stripe) {
    throw new SourceError("SOURCE_UNAVAILABLE", "Billing is not configured.", 503);
  }
  return stripe;
}
