import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/source/json-ld";
import { articleNode, graph } from "@/lib/seo/jsonld";
import { KnowledgeLayout } from "@/components/source/knowledge-layout";
import { AnswerBlock, FactBlock } from "@/components/source/knowledge";
import { catalogByPath } from "@/lib/seo/catalog";

const path = "/digital-product-passport/dpp-readiness";
const page = catalogByPath(path)!;

export const metadata: Metadata = pageMetadata(path);

export default function ReadinessPage() {
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
          { name: "DPP readiness", path },
        ]}
        title="Digital Product Passport readiness"
        lede="DPP readiness is the extent to which an organisation can identify the products it is responsible for documenting, and produce sufficiently reliable, traceable product information — including supplier evidence — before a passport is published."
        published="18 August 2026"
        reviewed="18 August 2026"
        related={[
          { href: "/methodology", label: "SOURCE methodology" },
          { href: "/how-it-works", label: "How SOURCE works" },
          { href: "/digital-product-passport/who-is-responsible", label: "Who is responsible" },
        ]}
      >
        <AnswerBlock
          question="What is DPP readiness?"
          answer="DPP readiness is not a published QR code. It is whether you can name the product, know which operator you are, see which required information already exists, judge whether the evidence is good enough to stand behind, list what is missing, and know which supplier or internal team must close the gap."
        />

        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          Why publication is not the first problem
        </h2>
        <p>
          Typical DPP tools start at “add product, fill fields, generate passport”. That works for a
          handful of SKUs. It fails when the catalogue already lives in ERP and the missing 20% of
          fields sit at 80 suppliers. Readiness is a portfolio problem.
        </p>

        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          A readiness assessment looks at
        </h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Product identity — is this the same article across systems?</li>
          <li>Operator hypothesis — manufacturer, importer, private label, distributor.</li>
          <li>Required information — from an adopted measure or a dataset you choose to work toward.</li>
          <li>Existing evidence — documents, claims, permissions, expiry.</li>
          <li>Confidence — declared is not verified.</li>
          <li>Missing data — grouped by supplier, not by email thread.</li>
          <li>Auditability — who changed what, and which document supports the value.</li>
        </ol>

        <FactBlock kind="interpretation">
          SOURCE’s discovery workspace implements identity, claim status, evidence levels, missing
          claims and supplier collection. It does not yet implement legal applicability per SKU or
          passport publication. Those limits are part of readiness honesty.
        </FactBlock>
        <FactBlock kind="recommendation">
          If you manage hundreds or thousands of SKUs, start by connecting the catalogue you already
          have.{" "}
          <Link href="/signup" className="underline-offset-4 hover:underline">
            Request an evidence assessment
          </Link>{" "}
          leads into SOURCE. The demo at /app is sample data and is not indexed.
        </FactBlock>

        <p>
          The detailed measurement model is on{" "}
          <Link href="/methodology" className="underline-offset-4 hover:underline">
            How SOURCE assesses evidence and coverage
          </Link>
          .
        </p>
      </KnowledgeLayout>
    </>
  );
}
