import type { Metadata } from "next";
import { SourceLinkButton } from "@/components/source/ui";
import { PageHero, Section, SectionHeader } from "@/components/source/knowledge";
import { SourceJsonLd } from "@/components/source/source-json-ld";
import { PRIMARY_CTA } from "@/lib/source/copy";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata("/manufacturers");

export default function ManufacturersPage() {
  return (
    <>
      <SourceJsonLd path="/manufacturers" />
      <article>
        <PageHero
          kicker="For manufacturers"
          title="Sit SOURCE beside the product systems you already run."
          lead="Operations, quality, sustainability, procurement, and DPP programme teams share one evidence layer. ERP, PIM, and PLM remain the systems of record. SOURCE does not become another catalogue."
        >
          <SourceLinkButton href={PRIMARY_CTA.href}>{PRIMARY_CTA.label}</SourceLinkButton>
        </PageHero>

        <Section>
          <SectionHeader
            kicker="Cross-functional use"
            title="One evidence desk for manufacturer and importer teams."
            lead="Different roles need different cuts of the same trail: what is missing, who owns the gap, whether reuse is permitted, and which records are still UNRESOLVED."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {[
              {
                title: "Product data and PIM",
                body: "Keep SKU identity, variants, and claim values in the catalogue you already maintain. SOURCE consumes those values and shows which ones still lack evidence.",
              },
              {
                title: "Quality and compliance",
                body: "Review attached files, validity windows, and conflicts without treating a stored percentage as proof. READY is the conjunction of the seven gates, not a marketing badge.",
              },
              {
                title: "Procurement and suppliers",
                body: "Send scoped requests to a responsible supplier or internal owner. Uncertain identities stay visible. Declines and silence stay on the record.",
              },
              {
                title: "DPP and sustainability programmes",
                body: "Prepare evidence before a passport is published elsewhere. SOURCE does not determine definitive legal scope for every SKU and does not issue data carriers.",
              },
            ].map((item) => (
              <div key={item.title} className="border border-ink/8 bg-card p-5">
                <h3 className="font-[family-name:var(--font-space)] text-base tracking-[-0.02em] text-ink">
                  {item.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink/70">{item.body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section className="bg-paper">
          <SectionHeader
            kicker="Importers and brand owners"
            title="The same layer if you place products on the EU market."
            lead="Importer and private-label teams often inherit incomplete supplier files. SOURCE records what arrived, what is still missing, and which requests were prepared — including unsuccessful ones."
          />
          <p className="mt-8 max-w-2xl text-[14.5px] leading-relaxed text-ink/70">
            Responsibility for a Digital Product Passport follows product-group rules and the economic
            operator placing the product on the market. SOURCE does not assign that legal role. It
            helps the team that already believes it must prepare evidence to see the gaps.
          </p>
        </Section>
      </article>
    </>
  );
}
