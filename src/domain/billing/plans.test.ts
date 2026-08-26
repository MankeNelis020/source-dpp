import { describe, expect, it } from "vitest";
import {
  BILLING_PLANS,
  billingPlanById,
  billingPlanByPriceId,
  checkoutPriceId,
  parseBillingPlanId,
} from "@/domain/billing/plans";

describe("billing catalog", () => {
  it("publishes the six EarthGND Stripe products and never exposes an Enterprise price", () => {
    expect(BILLING_PLANS.map((plan) => plan.id)).toEqual([
      "free",
      "core",
      "growth",
      "pro",
      "premium",
      "enterprise",
    ]);
    expect(billingPlanById("core").stripePriceId).toBe("price_1U8Ol8Caq9RrHwIdoFxn40P9");
    expect(billingPlanById("enterprise").stripePriceId).toBeUndefined();
    expect(billingPlanById("enterprise").checkout).toBe("contact_sales");
    expect(checkoutPriceId(billingPlanById("enterprise"))).toBeUndefined();
    expect(checkoutPriceId(billingPlanById("free"))).toBeUndefined();
    expect(checkoutPriceId(billingPlanById("growth"))).toBe("price_1U8OleCaq9RrHwIdRhMfJm8w");
  });

  it("allowlists plan ids and maps known price ids", () => {
    expect(parseBillingPlanId("CORE")).toBe("core");
    expect(parseBillingPlanId("price_1U8Ol8Caq9RrHwIdoFxn40P9")).toBeUndefined();
    expect(parseBillingPlanId("enterprise-plus")).toBeUndefined();
    expect(billingPlanByPriceId("price_1U8On6Caq9RrHwIdGUtMNBFN")?.id).toBe("premium");
    expect(billingPlanByPriceId("price_unknown")).toBeUndefined();
  });
});
