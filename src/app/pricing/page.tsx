import type { Metadata } from "next";
import { EvidenceLine, SourceLabel } from "@/components/source/ui";
import { BILLING_PLANS } from "@/domain/billing/plans";
import { PlanCheckoutButton } from "./plan-cta";

export const metadata: Metadata = { title: "Pricing" };

export default function PricingPage() {
  const contact = process.env.SOURCE_SALES_EMAIL?.trim() || null;
  return (
    <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <SourceLabel>Pricing</SourceLabel>
      <h1 className="mt-4 max-w-xl font-[family-name:var(--font-space)] text-[40px] font-medium leading-tight tracking-[-0.03em]">
        Priced on active supplier relationships, not SKUs.
      </h1>
      <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-[#101A15]/70">
        Catalogue size still matters for compute and storage. It does not tax reuse. Suppliers use
        SOURCE free. Paid plans are billed monthly in euro via Stripe Checkout.
      </p>
      <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {BILLING_PLANS.map((plan) => (
          <article
            key={plan.id}
            className={`border bg-[#FBFCFA] p-6 ${plan.highlighted ? "border-[#0B6E50]/40" : "border-[#101A15]/10"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <SourceLabel>{plan.name}</SourceLabel>
              {plan.highlighted ? <SourceLabel className="text-[#0B6E50]">Most teams start here</SourceLabel> : null}
            </div>
            <div className="mt-4 font-[family-name:var(--font-plex)] text-[22px] tracking-tight">
              {plan.priceLabel}
              {plan.cadence ? <span className="text-[12px] text-[#101A15]/50"> {plan.cadence}</span> : null}
            </div>
            <EvidenceLine className="mt-3" />
            <p className="mt-4 text-[13px] leading-relaxed text-[#101A15]/70">{plan.body}</p>
            <ul className="mt-5 space-y-1.5 text-[13px] text-[#101A15]/80">
              {plan.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <PlanCheckoutButton
              planId={plan.id}
              checkout={plan.checkout}
              salesEmail={contact}
              highlighted={plan.highlighted}
            />
          </article>
        ))}
      </div>
      <p className="mt-10 max-w-2xl text-[12px] leading-relaxed text-[#101A15]/50">
        Enterprise is custom pricing — contact sales rather than starting a Stripe Checkout session.
        Workspace terms remain draft product copy and require legal review.
      </p>
    </div>
  );
}
