import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/source/json-ld";
import { articleNode, graph } from "@/lib/seo/jsonld";
import { KnowledgeLayout } from "@/components/source/knowledge-layout";
import { AnswerBlock, FactBlock } from "@/components/source/knowledge";
import { Citation } from "@/components/source/citation";
import { catalogByPath } from "@/lib/seo/catalog";

const path = "/digital-product-passport/what-is-a-dpp";
const page = catalogByPath(path)!;

export const metadata: Metadata = pageMetadata(path);

export default function WhatIsDppPage() {
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
        ])}
      />
      <KnowledgeLayout
        crumbs={[
          { name: "Digital Product Passport", path: "/digital-product-passport" },
          { name: "What is a DPP?", path },
        ]}
        title="What is a Digital Product Passport?"
        lede="A Digital Product Passport is a structured packet of product information that can be accessed electronically. It is not, by itself, a QR code, a PDF, or a marketing claim."
        published="18 August 2026"
        reviewed="18 August 2026"
        related={[
          { href: "/digital-product-passport/espr", label: "ESPR and the DPP" },
          { href: "/digital-product-passport/dpp-readiness", label: "DPP readiness" },
          { href: "/resources/glossary", label: "Glossary" },
        ]}
      >
        <AnswerBlock
          question="What is a Digital Product Passport?"
          answer="Under the EU ESPR framework, a Digital Product Passport is a digital identity card for products, components and materials: electronically accessible information that can support sustainability, circularity and legal compliance. What must be in a given passport is defined for the product group, not copied from a generic template."
        >
          <Citation source="esprSummary" />
        </AnswerBlock>

        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          What a DPP is not
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>It is not automatically required for every product placed on the EU market today.</li>
          <li>It is not the same as a consumer-facing sustainability webpage.</li>
          <li>A data carrier (often discussed as a QR code) is a way to reach the record, not the record itself.</li>
        </ul>

        <FactBlock kind="regulation">
          The ESPR summary states that DPP information depends on the product and can include
          technical performance, materials and origins, repair, recycling and life-cycle
          environmental impacts. Those examples are illustrative of the framework; they are not a
          field list for your SKU.
        </FactBlock>
        <FactBlock kind="interpretation">
          For a retailer, brand or manufacturer with thousands of SKUs, the hard work is assembling
          reliable product and supplier evidence before any carrier is printed.
        </FactBlock>
        <FactBlock kind="recommendation">
          Treat passport publication as a later step. Start with identity, existing documents, and
          gaps. That is the problem{" "}
          <Link href="/" className="underline-offset-4 hover:underline">
            SOURCE
          </Link>{" "}
          is built around.
        </FactBlock>
      </KnowledgeLayout>
    </>
  );
}
