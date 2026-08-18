import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/source/json-ld";
import { definedTermNode, graph } from "@/lib/seo/jsonld";
import { KnowledgeLayout } from "@/components/source/knowledge-layout";
import { SITE_URL } from "@/lib/seo/site";
import { PRIMARY_SOURCES } from "@/lib/seo/sources";

export const metadata: Metadata = pageMetadata("/resources/glossary");

const TERMS = [
  {
    name: "Digital Product Passport",
    also: "DPP",
    href: "/digital-product-passport/what-is-a-dpp",
    definition:
      "A structured, electronically accessible record of product information introduced in EU product law. Exact content depends on the applicable product-group rules.",
  },
  {
    name: "Ecodesign for Sustainable Products Regulation",
    also: "ESPR",
    href: "/digital-product-passport/espr",
    definition:
      "Regulation (EU) 2024/1781, a framework in force since 18 July 2024 for setting ecodesign requirements, including the Digital Product Passport concept.",
    source: PRIMARY_SOURCES.espr.href,
  },
  {
    name: "Delegated act",
    also: "Product-group measure",
    href: "/digital-product-passport/espr",
    definition:
      "A Commission act that can specify requirements for a product group under a framework regulation. DPP field lists and dates typically appear here, not as a single ESPR appendix for all goods.",
  },
  {
    name: "Economic operator",
    also: "Manufacturer, importer, distributor",
    href: "/digital-product-passport/who-is-responsible",
    definition:
      "A role in placing or making a product available on the EU market. Roles are not interchangeable; private-label and import chains change who may have to provide information.",
  },
  {
    name: "Data carrier",
    also: "QR code",
    href: "/digital-product-passport/what-is-a-dpp",
    definition:
      "A physical or digital pointer to the passport record. The carrier is not the evidence. SOURCE does not currently issue carriers.",
  },
  {
    name: "DPP readiness",
    also: "Catalogue evidence-ready",
    href: "/digital-product-passport/dpp-readiness",
    definition:
      "The extent to which an organisation can identify products, attach reliable evidence, see gaps, and collect missing information from suppliers before publication.",
  },
  {
    name: "Evidence",
    also: "Provenance",
    href: "/methodology",
    definition:
      "In SOURCE, an original document or record linked to a claim, with issuer, validity and a verification status. Missing evidence means the line under a value is missing.",
  },
  {
    name: "Claim",
    also: "Product data statement",
    href: "/methodology",
    definition:
      "A versioned statement of a property on a subject. SOURCE shows status (declared, evidenced, verified) and never labels a claim as simply true.",
  },
];

export default function GlossaryPage() {
  return (
    <>
      <JsonLd
        data={graph(
          TERMS.map((term) =>
            definedTermNode({
              name: term.name,
              description: term.definition,
              url: `${SITE_URL}${term.href}`,
            })
          )
        )}
      />
      <KnowledgeLayout
        crumbs={[
          { name: "Resources", path: "/resources/glossary" },
          { name: "Glossary", path: "/resources/glossary" },
        ]}
        title="Digital Product Passport glossary"
        lede="Short definitions for crawlers, answer engines and practitioners. Legal meanings belong to the cited regulation; SOURCE meanings belong to the product."
        published="18 August 2026"
        reviewed="18 August 2026"
        related={[
          { href: "/digital-product-passport", label: "DPP hub" },
          { href: "/methodology", label: "Methodology" },
        ]}
      >
        <dl className="space-y-10">
          {TERMS.map((term) => (
            <div key={term.name} id={term.also.replace(/\s+/g, "-").toLowerCase()}>
              <dt className="font-[family-name:var(--font-space)] text-[20px] tracking-[-0.02em] text-ink">
                {term.name}
              </dt>
              <dd className="mt-1 font-[family-name:var(--font-plex)] text-[11px] uppercase tracking-[0.12em] text-ink/45">
                {term.also}
              </dd>
              <dd className="mt-3">{term.definition}</dd>
              <dd className="mt-2">
                <Link href={term.href} className="text-[13px] underline-offset-4 hover:underline">
                  {term.name}
                </Link>
                {term.source ? (
                  <>
                    {" · "}
                    <a
                      href={term.source}
                      className="text-[13px] underline-offset-4 hover:underline"
                      rel="noopener noreferrer"
                    >
                      Primary source
                    </a>
                  </>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </KnowledgeLayout>
    </>
  );
}
