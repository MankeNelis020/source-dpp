import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/source/json-ld";
import { articleNode, faqPageNode, graph } from "@/lib/seo/jsonld";
import { KnowledgeLayout } from "@/components/source/knowledge-layout";
import { AnswerBlock, FactBlock, FaqList } from "@/components/source/knowledge";
import { Citation, SourceList } from "@/components/source/citation";
import { catalogByPath } from "@/lib/seo/catalog";

const path = "/digital-product-passport";
const page = catalogByPath(path)!;

export const metadata: Metadata = pageMetadata(path);

const faqs = [
  {
    q: "What is a Digital Product Passport?",
    a: "A Digital Product Passport is a structured, electronically accessible set of product information introduced in EU product law. Exact fields, access rules and deadlines are set per product group — not as one universal form for every SKU.",
  },
  {
    q: "When does a DPP become mandatory?",
    a: "The ESPR framework has applied since 18 July 2024. Product-specific Digital Product Passport obligations follow delegated acts for each product group. There is no single date on which every product in the EU needs a DPP.",
  },
  {
    q: "Does SOURCE create Digital Product Passports?",
    a: "SOURCE is built to make a catalogue evidence-ready: identity, existing claims, missing data and supplier collection. Publishing a passport or QR code is not the current discovery product. A DPP is treated as an output of a complete record.",
  },
];

export default function DppHubPage() {
  return (
    <>
      <JsonLd
        data={graph([
          articleNode({
            path,
            headline: page.title,
            description: page.description,
            datePublished: "2026-08-18",
            dateModified: "2026-08-18",
          }),
          faqPageNode(faqs),
        ])}
      />
      <KnowledgeLayout
        crumbs={[{ name: "Digital Product Passport", path }]}
        title="Digital Product Passport"
        lede="A Digital Product Passport is a digital identity card for a product, component or material. Under EU law it is being introduced as a framework, then specified product group by product group. For most organisations the operational problem is evidence across a catalogue, not the QR code."
        published="18 August 2026"
        reviewed="18 August 2026"
        related={[
          { href: "/digital-product-passport/what-is-a-dpp", label: "What is a Digital Product Passport?" },
          { href: "/digital-product-passport/espr", label: "ESPR" },
          { href: "/digital-product-passport/who-is-responsible", label: "Who is responsible" },
          { href: "/digital-product-passport/dpp-readiness", label: "DPP readiness" },
          { href: "/methodology", label: "SOURCE methodology" },
        ]}
      >
        <AnswerBlock
          question="What should an organisation do first?"
          answer="Identify products and suppliers, see which information and evidence already exist, and collect what is missing from the party that holds it. Generating a passport on an empty record does not create readiness."
        />

        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          Current regulatory status
        </h2>
        <FactBlock kind="regulation">
          <Citation source="espr">
            Regulation (EU) 2024/1781 establishes a framework for ecodesign requirements for
            sustainable products, including the Digital Product Passport. The regulation has applied
            since 18 July 2024.
          </Citation>{" "}
          Product-specific information requirements are set later through delegated acts, not as a
          single list in the framework itself.
        </FactBlock>
        <FactBlock kind="interpretation">
          Until a delegated act (or another product-specific rule, such as the batteries regulation)
          applies to a group, “our SKUs need a DPP next quarter” is not something SOURCE — or a
          marketing page — can assert as settled law.
        </FactBlock>

        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          What organisations need to know
        </h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <Link href="/digital-product-passport/what-is-a-dpp" className="underline-offset-4 hover:underline">
              What a Digital Product Passport is
            </Link>{" "}
            — and what it is not.
          </li>
          <li>
            <Link href="/digital-product-passport/espr" className="underline-offset-4 hover:underline">
              How ESPR relates to DPP
            </Link>{" "}
            — framework versus delegated acts.
          </li>
          <li>
            <Link href="/digital-product-passport/who-is-responsible" className="underline-offset-4 hover:underline">
              Who may be responsible
            </Link>{" "}
            — economic operators are not interchangeable.
          </li>
          <li>
            <Link href="/digital-product-passport/dpp-readiness" className="underline-offset-4 hover:underline">
              DPP readiness
            </Link>{" "}
            — identity, evidence, gaps, suppliers, audit trail.
          </li>
        </ol>

        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          SOURCE product capability
        </h2>
        <p>
          The SOURCE workspace connects a catalogue, resolves product and supplier identity, shows
          coverage and missing claims, and groups supplier requests. That maps to readiness work,
          not to legal classification. Read{" "}
          <Link href="/product" className="underline-offset-4 hover:underline">
            the product
          </Link>{" "}
          and{" "}
          <Link href="/methodology" className="underline-offset-4 hover:underline">
            the methodology
          </Link>
          .
        </p>

        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          Primary sources
        </h2>
        <SourceList ids={["espr", "esprSummary", "batteries"]} />

        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          FAQ
        </h2>
        <FaqList items={faqs} />
      </KnowledgeLayout>
    </>
  );
}
