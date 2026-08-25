import type { Metadata } from "next";
import Link from "next/link";
import { SourceLinkButton } from "@/components/source/ui";
import { PageHero, Section, SectionHeader } from "@/components/source/knowledge";
import { SourceJsonLd } from "@/components/source/source-json-ld";
import { PRIMARY_CTA, RESOURCE_DIRECTIONS } from "@/lib/source/copy";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata("/resources");

export default function ResourcesPage() {
  return (
    <>
      <SourceJsonLd path="/resources" />
      <article>
        <PageHero
          kicker="Resources"
          title="Published knowledge now. Future briefs when they exist."
          lead="SOURCE does not publish empty articles to occupy URLs. Directions below are labelled forthcoming until there is substantive material."
        >
          <SourceLinkButton href={PRIMARY_CTA.href}>{PRIMARY_CTA.label}</SourceLinkButton>
        </PageHero>

        <Section>
          <SectionHeader
            kicker="Available now"
            title="Knowledge pages you can cite."
            lead="The Digital Product Passport hub and glossary cite primary EU texts. They are not legal advice."
          />
          <ul className="mt-8 space-y-3 text-[14.5px]">
            <li>
              <Link href="/digital-product-passport" className="underline-offset-4 hover:underline">
                Digital Product Passport hub
              </Link>
            </li>
            <li>
              <Link href="/resources/glossary" className="underline-offset-4 hover:underline">
                Glossary
              </Link>
            </li>
            <li>
              <Link href="/methodology" className="underline-offset-4 hover:underline">
                Methodology
              </Link>
            </li>
            <li>
              <Link href="/faq" className="underline-offset-4 hover:underline">
                FAQ
              </Link>
            </li>
          </ul>
        </Section>

        <Section className="bg-paper">
          <SectionHeader
            kicker="Forthcoming"
            title="Directions, not completed content."
            lead="Pilot-research notes will appear here only when they have a source, a date, and a claim that can be defended."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {RESOURCE_DIRECTIONS.map((item) => (
              <div key={item.title} className="border border-ink/8 bg-card p-5">
                <p className="font-[family-name:var(--font-plex)] text-[10px] uppercase tracking-[0.14em] text-ink/45">
                  Forthcoming
                </p>
                <h3 className="mt-2 font-[family-name:var(--font-space)] text-base tracking-[-0.02em] text-ink">
                  {item.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink/70">{item.body}</p>
              </div>
            ))}
          </div>
        </Section>
      </article>
    </>
  );
}
