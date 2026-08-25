import type { Metadata } from "next";
import { SourceLinkButton } from "@/components/source/ui";
import { PageHero, Section, SectionHeader } from "@/components/source/knowledge";
import { SourceJsonLd } from "@/components/source/source-json-ld";
import { LIFECYCLE, PRIMARY_CTA, SUPPLIER_CTA } from "@/lib/source/copy";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata("/how-it-works");

export default function HowItWorksPage() {
  return (
    <>
      <SourceJsonLd path="/how-it-works" />
      <article>
        <PageHero
          kicker="How it works"
          title="From import to downstream availability, including the cases that fail."
          lead="The lifecycle is not a guaranteed path to READY. Wrong contacts, uncertainty, delegation, permission denial, expired evidence, conflicts, and manual escalation are part of the product — not exceptions hidden from the manufacturer."
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <SourceLinkButton href={PRIMARY_CTA.href} className="justify-center">
              {PRIMARY_CTA.label}
            </SourceLinkButton>
            <SourceLinkButton href={SUPPLIER_CTA.href} variant="ghost" className="justify-center">
              {SUPPLIER_CTA.label}
            </SourceLinkButton>
          </div>
        </PageHero>

        <Section>
          <ol className="space-y-6">
            {LIFECYCLE.map((step, i) => (
              <li key={step.title} className="border border-ink/8 bg-card p-6">
                <p className="font-[family-name:var(--font-plex)] text-[11px] font-medium uppercase tracking-[0.14em] text-ink/55">
                  Stage {i + 1}
                </p>
                <h2 className="mt-2 font-[family-name:var(--font-space)] text-xl tracking-[-0.02em] text-ink">
                  {step.title}
                </h2>
                <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-ink/70">{step.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section className="bg-paper">
          <SectionHeader
            kicker="Unsuccessful outcomes"
            title="A request that does not resolve is still a recorded result."
            lead="SOURCE keeps these outcomes on the product record so a reviewer can see why a claim is not READY."
          />
          <ul className="mt-8 grid gap-3 md:grid-cols-2">
            {[
              "Wrong contact — the named party is not the evidence owner; the request is redirected or left open.",
              "Uncertainty — the supplier cannot confirm the value; the claim stays UNRESOLVED with that reason.",
              "Delegation — a downstream party is asked to respond; the chain is recorded, not collapsed.",
              "Permission denial — evidence exists but reuse on this identity or channel is refused.",
              "Expired evidence — a previously valid file falls outside its validity window.",
              "Conflicts — two sources disagree; neither value is silently preferred.",
              "No response — the request remains open until the manufacturer escalates or closes it.",
              "Manual escalation — SOURCE prepares the trail; a person decides the next commercial step.",
            ].map((line) => (
              <li key={line} className="border border-ink/8 bg-card p-4 text-[13px] leading-relaxed text-ink">
                {line}
              </li>
            ))}
          </ul>
        </Section>
      </article>
    </>
  );
}
