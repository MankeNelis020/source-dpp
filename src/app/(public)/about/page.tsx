import type { Metadata } from "next";
import Link from "next/link";
import { SourceLinkButton } from "@/components/source/ui";
import { PageHero, Section, SectionHeader } from "@/components/source/knowledge";
import { SourceJsonLd } from "@/components/source/source-json-ld";
import { PRIMARY_CTA, READINESS_GATES } from "@/lib/source/copy";
import { SOURCE_DEFINITION, SOURCE_DOES_NOT } from "@/lib/seo/site";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata("/about");

export default function AboutPage() {
  return (
    <>
      <SourceJsonLd path="/about" />
      <article>
        <PageHero
          kicker="About"
          title="A value alone is not evidence."
          lead={`${SOURCE_DEFINITION} ${SOURCE_DOES_NOT}`}
        >
          <SourceLinkButton href={PRIMARY_CTA.href}>{PRIMARY_CTA.label}</SourceLinkButton>
        </PageHero>

        <Section>
          <SectionHeader
            kicker="Thesis"
            title="Identity, evidence, scope, validity, permission, and conflict review have to travel with the number."
            lead="SOURCE exists because product information for compliance is usually already somewhere — in ERP, PIM, certificates, inboxes, and supplier files — and is rarely complete enough to stand behind a published claim."
          />
          <ol className="mt-10 space-y-3">
            {READINESS_GATES.map((gate) => (
              <li key={gate.title} className="border border-ink/8 bg-card p-4">
                <p className="text-sm font-medium text-ink">{gate.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink/70">{gate.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section className="bg-paper">
          <SectionHeader
            kicker="Where we are"
            title="Amsterdam, European Union."
            lead="Knowledge pages cite Regulation (EU) 2024/1781 and related primary texts. They are written by SOURCE Research, not by a named solicitor. They are not legal advice."
          />
          <p className="mt-8 max-w-2xl text-[14.5px] leading-relaxed text-ink/70">
            For regulatory background, start at the{" "}
            <Link href="/digital-product-passport" className="underline-offset-4 hover:underline">
              Digital Product Passport hub
            </Link>
            . For how SOURCE measures coverage today, see{" "}
            <Link href="/methodology" className="underline-offset-4 hover:underline">
              methodology
            </Link>
            . The demo workspace at /app is a private illustration with sample data and is not indexed.
          </p>
        </Section>
      </article>
    </>
  );
}
