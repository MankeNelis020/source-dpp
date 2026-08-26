/**
 * SOURCE billing catalog. Price and product IDs are public Stripe identifiers,
 * not secrets. Domain must not import the Stripe SDK.
 *
 * Enterprise has no Price ID: checkout must not create a Stripe session.
 */

export const BILLING_PLAN_IDS = ["free", "core", "growth", "pro", "premium", "enterprise"] as const;

export type BillingPlanId = (typeof BILLING_PLAN_IDS)[number];

export type BillingCheckoutKind = "signup" | "checkout" | "contact_sales";

export interface BillingPlan {
  id: BillingPlanId;
  name: string;
  /** Display amount, e.g. "€185". Enterprise uses "Custom". */
  priceLabel: string;
  cadence: string;
  amountCents: number | null;
  currency: "eur";
  interval: "month" | null;
  body: string;
  items: string[];
  highlighted?: boolean;
  checkout: BillingCheckoutKind;
  stripeProductId: string;
  /** Absent for Enterprise (custom pricing). */
  stripePriceId?: string;
}

export const BILLING_PLANS: readonly BillingPlan[] = [
  {
    id: "free",
    name: "Free",
    priceLabel: "€0",
    cadence: "/ month",
    amountCents: 0,
    currency: "eur",
    interval: "month",
    body: "Start with the product data you already have.",
    items: ["One workspace", "Missing-information loop", "Suppliers always free", "Community support"],
    checkout: "signup",
    stripeProductId: "prod_V8g6lkCjhzYTcL",
    stripePriceId: "price_1U8OkYCaq9RrHwIdjoSRwIm9",
  },
  {
    id: "core",
    name: "Core",
    priceLabel: "€185",
    cadence: "/ month",
    amountCents: 18500,
    currency: "eur",
    interval: "month",
    body: "For growing manufacturer teams.",
    items: ["Active supplier relationships", "Workflows", "Evidence ledger", "Standard exports"],
    highlighted: true,
    checkout: "checkout",
    stripeProductId: "prod_V8g7dNaZVMtjmY",
    stripePriceId: "price_1U8Ol8Caq9RrHwIdoFxn40P9",
  },
  {
    id: "growth",
    name: "Growth",
    priceLabel: "€425",
    cadence: "/ month",
    amountCents: 42500,
    currency: "eur",
    interval: "month",
    body: "For teams running SOURCE across a live supply chain.",
    items: ["Higher supplier volume", "Team roles", "Catalogue reuse", "Priority support"],
    checkout: "checkout",
    stripeProductId: "prod_V8g76cjJSpalFu",
    stripePriceId: "price_1U8OleCaq9RrHwIdRhMfJm8w",
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "€895",
    cadence: "/ month",
    amountCents: 89500,
    currency: "eur",
    interval: "month",
    body: "For larger networks and formal operations.",
    items: ["Advanced permissions", "Integrations", "SLA-backed support", "Operational exports"],
    checkout: "checkout",
    stripeProductId: "prod_V8g8Ywjz1FH6oP",
    stripePriceId: "price_1U8OmXCaq9RrHwIdEbdMaYve",
  },
  {
    id: "premium",
    name: "Premium",
    priceLabel: "€1,495",
    cadence: "/ month",
    amountCents: 149500,
    currency: "eur",
    interval: "month",
    body: "For high-volume supply chains.",
    items: ["Premium SLA", "Dedicated onboarding", "Advanced exports", "Priority operations"],
    checkout: "checkout",
    stripeProductId: "prod_V8g9yWYOI1LRKL",
    stripePriceId: "price_1U8On6Caq9RrHwIdGUtMNBFN",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceLabel: "Custom",
    cadence: "",
    amountCents: null,
    currency: "eur",
    interval: null,
    body: "For multiple entities and large networks.",
    items: ["Custom pricing", "Multiple legal entities", "Large supplier networks", "Enterprise integrations"],
    checkout: "contact_sales",
    stripeProductId: "prod_V8gBAv84ynngVC",
  },
];

export const SELECTED_PLAN_STORAGE_KEY = "source_selected_plan";

export function isBillingPlanId(value: string | null | undefined): value is BillingPlanId {
  return Boolean(value && (BILLING_PLAN_IDS as readonly string[]).includes(value));
}

export function parseBillingPlanId(value: string | null | undefined): BillingPlanId | undefined {
  const next = value?.trim().toLowerCase();
  return isBillingPlanId(next) ? next : undefined;
}

export function billingPlanById(id: BillingPlanId): BillingPlan {
  const plan = BILLING_PLANS.find((row) => row.id === id);
  if (!plan) throw new Error("Unknown billing plan.");
  return plan;
}

export function billingPlanByPriceId(priceId: string | undefined): BillingPlan | undefined {
  if (!priceId) return undefined;
  return BILLING_PLANS.find((row) => row.stripePriceId === priceId);
}

export function checkoutPriceId(plan: BillingPlan): string | undefined {
  if (plan.checkout !== "checkout") return undefined;
  return plan.stripePriceId;
}
