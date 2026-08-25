import type { Metadata } from "next";
import Link from "next/link";
import { SourceLinkButton } from "@/components/source/ui";
import { PageHero, Section, SectionHeader } from "@/components/source/knowledge";
import { SourceJsonLd } from "@/components/source/source-json-ld";
import { PRIMARY_CTA } from "@/lib/source/copy";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata("/dpp-readiness");

export default function DppReadinessCommercialPage() {
  return (
    <>
      <SourceJsonLd path="/dpp-readiness" />
      <article>
        <PageHero
          kicker="DPP readiness"
          title="Prepare evidence before a passport is published. SOURCE does not publish it."
          lead="SOURCE supports pre-publication evidence preparation for European manufacturers. It does not publish Digital Product Passports, create QR codes or data carriers, or determine definitive legal scope for every SKU."
        >
          <SourceLinkButton href={PRIMARY_CTA.href}>{PRIMARY_CTA.label}</SourceLinkButton>
        </PageHero>

        <Section>
          <SectionHeader
            kicker="Boundary"
            title="Evidence preparation is not passport publication."
            lead="A Digital Product Passport, where required, is issued in a publication environment with product-group rules. SOURCE holds the evidence trail those systems need — including gaps and unresolved outcomes."
          />
          <div className="mt-10 grid gap-px overflow-hidden border border-ink/8 bg-ink/8 md:grid-cols-2">
            <div className="bg-card p-6">
              <p className="font-[family-name:var(--font-plex)] text-[11px] font-medium uppercase tracking-[0.14em] text-ink/55">
                In scope
              </p>
              <ul className="mt-4 space-y-2 text-[13px] text-ink">
                <li>Find which claims still lack evidence, scope, validity, or permission.</li>
                <li>Retrieve existing files when reuse is recorded as allowed.</li>
                <li>Prepare targeted requests to suppliers or internal owners.</li>
                <li>Export the evidence trail for review before publication elsewhere.</li>
              </ul>
            </div>
            <div className="bg-card p-6">
              <p className="font-[family-name:var(--font-plex)] text-[11px] font-medium uppercase tracking-[0.14em] text-ink/55">
                Out of scope
              </p>
              <ul className="mt-4 space-y-2 text-[13px] text-ink">
                <li>Publishing a Digital Product Passport.</li>
                <li>Creating QR codes, NFC tags, or other data carriers.</li>
                <li>Deciding, for every SKU, whether a delegated act applies.</li>
                <li>Certifying that a record is legally sufficient.</li>
              </ul>
            </div>
          </div>
        </Section>

        <Section className="bg-paper">
          <SectionHeader
            kicker="Product-group scope"
            title="Legal sufficiency is product-group specific."
            lead="Regulation (EU) 2024/1781 is a framework. Exact passport fields and duties arrive in delegated acts. SOURCE does not claim that a READY record is legally sufficient for every product group."
          />
          <p className="mt-8 max-w-2xl text-[14.5px] leading-relaxed text-ink/70">
            For regulatory background, see the{" "}
            <Link href="/digital-product-passport" className="underline-offset-4 hover:underline">
              Digital Product Passport knowledge hub
            </Link>
            . Those pages cite primary EU texts and are not legal advice. Any future claim about legal
            sufficiency under a delegated act requires product-group-specific legal review.
          </p>
        </Section>
      </article>
    </>
  );
}
