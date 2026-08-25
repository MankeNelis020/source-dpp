import type { Metadata } from "next";
import { SourceLinkButton } from "@/components/source/ui";
import { FaqList, PageHero, Section } from "@/components/source/knowledge";
import { SourceJsonLd } from "@/components/source/source-json-ld";
import { PRIMARY_CTA, PUBLIC_FAQS } from "@/lib/source/copy";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata("/faq");

export default function FaqPage() {
  return (
    <>
      <SourceJsonLd path="/faq" includeFaq />
      <article>
        <PageHero
          kicker="FAQ"
          title="Boundaries, readiness, supplier outcomes, and pricing status."
          lead="These answers are operational, not legal advice. They describe what SOURCE records and what it does not claim."
        >
          <SourceLinkButton href={PRIMARY_CTA.href}>{PRIMARY_CTA.label}</SourceLinkButton>
        </PageHero>
        <Section>
          <FaqList items={PUBLIC_FAQS.map((item) => ({ q: item.q, a: item.a }))} />
        </Section>
      </article>
    </>
  );
}
