import { describe, expect, it } from "vitest";
import { MemoryPersistence } from "@/infrastructure/database/memory";
import { MemoryStripeBillingAdapter } from "@/infrastructure/billing/memory";
import { ROLE_CAPABILITIES } from "@/server/source/authorization";
import { SourceError, type Principal } from "@/server/source/types";
import {
  applyStripeBillingEvent,
  organisationBillingStatus,
  requireStripeBilling,
  startCheckoutSession,
  startCustomerPortalSession,
} from "@/server/source/billing";
import { loadSourceEnvironment } from "@/infrastructure/environment/source-environment";
import Stripe from "stripe";
import { LiveStripeBillingAdapter } from "@/infrastructure/billing/live";

const OWNER: Principal = {
  kind: "user",
  userId: "user-acme-owner",
  organisationId: "acme",
  membershipId: "mem-acme-owner",
  roles: ["OWNER"],
  capabilities: [...ROLE_CAPABILITIES.OWNER],
  email: "owner@acme.example",
  authenticationMethod: "TEST",
};

const MEMBER: Principal = {
  ...OWNER,
  userId: "user-acme-reviewer",
  membershipId: "mem-acme-reviewer",
  roles: ["REVIEWER"],
  capabilities: [...ROLE_CAPABILITIES.REVIEWER],
  email: "reviewer@acme.example",
};

function localEnv() {
  return loadSourceEnvironment({ SOURCE_ENV: "local" });
}

describe("SOURCE billing checkout", () => {
  it("creates a Checkout session only for allowlisted paid plans", async () => {
    const store = new MemoryPersistence();
    const stripe = new MemoryStripeBillingAdapter();
    const result = await startCheckoutSession({
      store,
      stripe,
      env: localEnv(),
      principal: OWNER,
      email: OWNER.email,
      planId: "core",
    });
    expect(result.url).toContain("checkout.stripe.test");
    expect(stripe.checkoutSessions[0]?.priceId).toBe("price_1U8Ol8Caq9RrHwIdoFxn40P9");
    expect(stripe.checkoutSessions[0]?.organisationId).toBe("acme");
  });

  it("rejects Enterprise, Free, unknown plans, and members without organisation:manage", async () => {
    const store = new MemoryPersistence();
    const stripe = new MemoryStripeBillingAdapter();
    const env = localEnv();
    await expect(
      startCheckoutSession({ store, stripe, env, principal: OWNER, email: OWNER.email, planId: "enterprise" })
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      startCheckoutSession({ store, stripe, env, principal: OWNER, email: OWNER.email, planId: "free" })
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      startCheckoutSession({ store, stripe, env, principal: OWNER, email: OWNER.email, planId: "price_injected" })
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      startCheckoutSession({ store, stripe, env, principal: MEMBER, email: MEMBER.email, planId: "core" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(stripe.checkoutSessions).toHaveLength(0);
  });

  it("fails closed when Stripe is not configured", () => {
    expect(() => requireStripeBilling(undefined)).toThrow(SourceError);
    try {
      requireStripeBilling(undefined);
    } catch (error) {
      expect(error).toBeInstanceOf(SourceError);
      expect((error as SourceError).httpStatus).toBe(503);
    }
  });

  it("opens the customer portal only when a Stripe customer exists", async () => {
    const store = new MemoryPersistence();
    const stripe = new MemoryStripeBillingAdapter();
    const env = localEnv();
    await expect(startCustomerPortalSession({ store, stripe, env, principal: OWNER })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await store.saveOrganisationBilling({
      organisationId: "acme",
      stripeCustomerId: "cus_test",
      planId: "core",
      status: "active",
      updatedAt: "2026-08-26T00:00:00.000Z",
    });
    const portal = await startCustomerPortalSession({ store, stripe, env, principal: OWNER });
    expect(portal.url).toContain("billing.stripe.test");
  });
});

describe("SOURCE billing webhooks", () => {
  it("records checkout.session.completed against the organisation and is idempotent", async () => {
    const store = new MemoryPersistence();
    const stripe = new MemoryStripeBillingAdapter();
    stripe.subscriptions.set("sub_1", {
      id: "sub_1",
      customerId: "cus_1",
      status: "active",
      priceId: "price_1U8Ol8Caq9RrHwIdoFxn40P9",
      currentPeriodEnd: "2026-09-26T00:00:00.000Z",
    });
    const event = {
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          client_reference_id: "acme",
          customer: "cus_1",
          subscription: "sub_1",
          metadata: { organisationId: "acme", planId: "core" },
        },
      },
    };
    const first = await applyStripeBillingEvent({ store, stripe, event, now: new Date("2026-08-26T12:00:00.000Z") });
    const second = await applyStripeBillingEvent({ store, stripe, event, now: new Date("2026-08-26T12:01:00.000Z") });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    const billing = await store.getOrganisationBilling("acme");
    expect(billing?.planId).toBe("core");
    expect(billing?.stripeCustomerId).toBe("cus_1");
    expect(billing?.status).toBe("active");
    const status = await organisationBillingStatus({ store, principal: OWNER, billingConfigured: true });
    expect(status.planName).toBe("Core");
    expect(status.hasCustomer).toBe(true);
  });

  it("maps subscription deletion back to Free", async () => {
    const store = new MemoryPersistence();
    const stripe = new MemoryStripeBillingAdapter();
    await store.saveOrganisationBilling({
      organisationId: "acme",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      planId: "growth",
      status: "active",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    await applyStripeBillingEvent({
      store,
      stripe,
      event: {
        id: "evt_del",
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_1",
            customer: "cus_1",
            status: "canceled",
            items: { data: [{ price: { id: "price_1U8OleCaq9RrHwIdRhMfJm8w" }, current_period_end: 1780000000 }] },
          },
        },
      },
    });
    expect((await store.getOrganisationBilling("acme"))?.planId).toBe("free");
    expect((await store.getOrganisationBilling("acme"))?.status).toBe("canceled");
  });

  it("rejects an invalid Stripe webhook signature", () => {
    const stripe = new LiveStripeBillingAdapter("sk_test_not_a_real_key");
    const payload = JSON.stringify({ id: "evt_sig", type: "checkout.session.completed", data: { object: {} } });
    expect(() => stripe.constructWebhookEvent(payload, "bad", "whsec_testsecret")).toThrow(/Invalid webhook signature/);
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_testsecret" });
    const event = stripe.constructWebhookEvent(payload, header, "whsec_testsecret");
    expect(event.id).toBe("evt_sig");
  });
});
