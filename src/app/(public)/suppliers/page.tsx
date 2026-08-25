import type { Metadata } from "next";
import { ClaimCard, SourceLinkButton, StatusPill } from "@/components/source/ui";
import { PageHero, Section, SectionHeader } from "@/components/source/knowledge";
import { SourceJsonLd } from "@/components/source/source-json-ld";
import { SUPPLIER_CTA } from "@/lib/source/copy";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata("/suppliers");

export default function SuppliersPage() {
  return (
    <>
      <SourceJsonLd path="/suppliers" />
      <article>
        <PageHero
          kicker="For suppliers"
          title="Scoped disclosure. You decide what leaves the request."
          lead="A SOURCE request names the product identity, the claim, and the evidence sought. You can answer, decline, delegate, mark uncertainty, or refuse reuse permission. None of those outcomes is hidden from the manufacturer."
        >
          <SourceLinkButton href={SUPPLIER_CTA.href}>{SUPPLIER_CTA.label}</SourceLinkButton>
        </PageHero>

        <Section>
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <div>
              <SectionHeader
                kicker="Illustration"
                title="Fictional example data, not a live supplier."
                lead="Nordform Metals GmbH is an invented counterpart used to show how a scoped request looks. It is not a customer, partner, or real legal entity."
              />
              <ul className="mt-8 space-y-3 text-[13px] leading-relaxed text-ink/80">
                <li>Disclose only the files the request asks for.</li>
                <li>Delegate to a mill or recycler; the chain stays visible.</li>
                <li>Mark a value as uncertain instead of guessing.</li>
                <li>Grant or refuse reuse permission for a named identity and purpose.</li>
                <li>Decline the request with a reason. Decline is a recorded outcome.</li>
              </ul>
            </div>
            <ClaimCard
              issuer="Nordform Metals GmbH"
              reuse="denied · this channel"
              verified={false}
            />
          </div>
        </Section>

        <Section className="bg-paper">
          <SectionHeader
            kicker="Non-success outcomes"
            title="A request is not a promise that someone will answer."
            lead="SOURCE does not claim supplier response rates. The demonstration request shows the interaction, not a performance guarantee."
          />
          <div className="mt-8 flex flex-wrap gap-2">
            <StatusPill tone="signal">Answered with permission</StatusPill>
            <StatusPill tone="teal">Delegated</StatusPill>
            <StatusPill tone="attention">Declined</StatusPill>
            <StatusPill tone="muted">Uncertain</StatusPill>
            <StatusPill tone="muted">No response</StatusPill>
            <StatusPill tone="attention">Permission denied</StatusPill>
          </div>
          <SourceLinkButton href={SUPPLIER_CTA.href} variant="ghost" className="mt-8">
            Open the demonstration request
          </SourceLinkButton>
        </Section>
      </article>
    </>
  );
}
