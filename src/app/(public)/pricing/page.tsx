import type { Metadata } from "next";
import { SourceLinkButton } from "@/components/source/ui";
import { PageHero, Section, SectionHeader } from "@/components/source/knowledge";
import { SourceJsonLd } from "@/components/source/source-json-ld";
import { PRIMARY_CTA } from "@/lib/source/copy";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata("/pricing");

export default function PricingPage() {
  return (
    <>
      <SourceJsonLd path="/pricing" />
      <article>
        <PageHero
          kicker="Pricing"
          title="Commercial terms follow a controlled assessment."
          lead="Public pages do not list fixed prices, implementation timelines, or go-live promises. Scope, connectors, and fees are confirmed after an evidence assessment of the catalogue you already run."
        >
          <SourceLinkButton href={PRIMARY_CTA.href}>{PRIMARY_CTA.label}</SourceLinkButton>
        </PageHero>

        <Section>
          <SectionHeader
            kicker="What an assessment covers"
            title="Enough to price the work without inventing a rate card."
            lead="An assessment looks at product identity sources, existing evidence, supplier concentration, and which integrations are in scope. It is not a self-serve checkout."
          />
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              "Which systems hold product identity today (ERP, PIM, PLM, or files).",
              "How many distinct supplier relationships are likely to receive requests.",
              "Whether APIs, webhooks, or named connectors are required — availability is confirmed per assessment, not assumed.",
              "Which claims and evidence types you want in the first working set.",
            ].map((line) => (
              <li key={line} className="border border-ink/8 bg-card p-4 text-[13px] leading-relaxed text-ink">
                {line}
              </li>
            ))}
          </ul>
        </Section>

        <Section className="bg-paper">
          <SectionHeader
            kicker="What we do not publish here"
            title="No invented prices, savings, or response-performance claims."
            lead="Supplier response rates, implementation savings, and time-to-live need real pilot evidence before they belong on this page. Suppliers answering a request are not charged a public list price on this site."
          />
          <p className="mt-8 max-w-2xl text-[14.5px] leading-relaxed text-ink/70">
            The assessment CTA uses the existing discovery flow at /signup. There is no separate
            self-service pricing calculator.
          </p>
        </Section>
      </article>
    </>
  );
}
