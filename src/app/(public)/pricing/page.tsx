import type { Metadata } from "next";
import { EvidenceLine, SourceButton, SourceLabel } from "@/components/source/ui";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata("/pricing");

const PLANS = [
  {
    name: "Pilot",
    price: "From €7,500",
    cadence: "one-off",
    body: "For proving SOURCE on one dataset.",
    items: ["25–50 suppliers", "CSV / API ingest", "Concierge onboarding", "ROI baseline"],
  },
  {
    name: "Core",
    price: "From €1,500",
    cadence: "/ month",
    body: "For growing manufacturer teams.",
    items: ["Active supplier relationships", "Workflows", "Evidence ledger", "Standard exports"],
  },
  {
    name: "Scale",
    price: "From €4,000",
    cadence: "/ month",
    body: "For larger supply chains.",
    items: ["Advanced permissions", "SSO", "Integrations", "SLA"],
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "",
    body: "For multiple entities and large networks.",
    items: ["Multiple legal entities", "Large supplier networks", "Premium SLA", "Enterprise integrations"],
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
      <SourceLabel>Pricing</SourceLabel>
      <h1 className="mt-4 max-w-xl font-[family-name:var(--font-space)] text-[40px] font-medium leading-[1.08] tracking-[-0.02em]">
        Priced on active supplier relationships, not SKUs.
      </h1>
      <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-ink/70">
        Catalogue size still matters for compute and storage. It does not tax reuse. Suppliers use
        SOURCE free.
      </p>
      <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => (
          <article key={plan.name} className="border border-ink/8 bg-card p-6">
            <SourceLabel>{plan.name}</SourceLabel>
            <div className="mt-4 font-[family-name:var(--font-plex)] text-[22px] tracking-tight">
              {plan.price}
              {plan.cadence ? (
                <span className="text-[12px] text-ink/50"> {plan.cadence}</span>
              ) : null}
            </div>
            <EvidenceLine className="mt-3" />
            <p className="mt-4 text-[13px] leading-relaxed text-ink/70">{plan.body}</p>
            <ul className="mt-5 space-y-1.5 text-[13px] text-ink/80">
              {plan.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <div className="mt-14">
        <SourceButton href="/signup">Talk to SOURCE</SourceButton>
      </div>
    </div>
  );
}
