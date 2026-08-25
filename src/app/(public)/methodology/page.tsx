import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/source/json-ld";
import { articleNode, graph } from "@/lib/seo/jsonld";
import { KnowledgeLayout } from "@/components/source/knowledge-layout";
import { FactBlock } from "@/components/source/knowledge";
import { catalogByPath } from "@/lib/seo/catalog";
import { CONFIDENCE_LEVELS } from "@/lib/source/brand";

const page = catalogByPath("/methodology")!;

export const metadata: Metadata = pageMetadata("/methodology");

export default function MethodologyPage() {
  return (
    <>
      <JsonLd
        data={graph([
          articleNode({
            path: "/methodology",
            headline: "How SOURCE assesses evidence and coverage",
            description: page.description,
            datePublished: "2026-08-18",
            dateModified: "2026-08-18",
          }),
        ])}
      />
      <KnowledgeLayout
        crumbs={[{ name: "Methodology", path: "/methodology" }]}
        title="How SOURCE assesses evidence and coverage"
        lede="SOURCE does not declare a product compliant. It records identity confidence, claim status, evidence level and what is still missing — then groups the gaps so a supplier can answer once."
        published="18 August 2026"
        reviewed="18 August 2026"
        related={[
          { href: "/digital-product-passport/dpp-readiness", label: "DPP readiness" },
          { href: "/how-it-works", label: "How it works" },
          { href: "/resources/glossary", label: "Glossary" },
        ]}
      >
        <FactBlock kind="recommendation">
          This page describes the discovery product as implemented in SOURCE today. It is not a
          legal methodology for deciding whether a SKU is in scope of a delegated act.
        </FactBlock>

        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          1. Product and supplier identity
        </h2>
        <p>
          Names, VAT numbers, GTINs and aliases are scored. High-confidence matches can be accepted
          automatically. Medium-confidence matches go to human review. Low confidence stays
          unresolved. Nothing is merged in doubt. See{" "}
          <Link href="/how-it-works" className="underline-offset-4 hover:underline">
            how SOURCE works
          </Link>
          .
        </p>

        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          2. Claims, not truth
        </h2>
        <p>
          A claim is a stated value for a property (for example recycled content) on a subject (a
          part, material or product). SOURCE never overwrites a claim. New information becomes a new
          version. Status is shown; “true” is not.
        </p>

        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          3. Evidence confidence
        </h2>
        <p>
          Values can carry a confidence level. Signal green is used for verified or active states,
          not as decoration.
        </p>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-ink/10">
              <th className="py-2 font-medium">Level</th>
              <th className="py-2 font-medium">Label</th>
              <th className="py-2 font-medium">Meaning in SOURCE</th>
            </tr>
          </thead>
          <tbody>
            {CONFIDENCE_LEVELS.map((row) => (
              <tr key={row.level} className="border-b border-ink/8">
                <td className="py-2 font-[family-name:var(--font-plex)]">L{row.level}</td>
                <td className="py-2">{row.label}</td>
                <td className="py-2 text-ink/70">
                  {row.level === 0 && "No usable statement yet."}
                  {row.level === 1 && "A party declared a value; evidence is not attached."}
                  {row.level === 2 && "A document or record supports the value."}
                  {row.level === 3 && "A human review accepted the evidence. The model never sets this."}
                  {row.level === 4 && "The value can be followed through identity, document and permission."}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          4. Missing information
        </h2>
        <p>
          Required properties come from a dataset the organisation attaches (in the demo: a named
          ESPR aluminium dataset). SOURCE subtracts what is already available or reusable, then
          groups remaining actions per supplier and product family — not one email per SKU.
        </p>

        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          5. What this is not
        </h2>
        <p>
          SOURCE does not currently classify legal Digital Product Passport applicability, complete
          a published passport, or replace market-surveillance judgement. Those gaps are stated so
          the{" "}
          <Link href="/digital-product-passport/dpp-readiness" className="underline-offset-4 hover:underline">
            DPP readiness
          </Link>{" "}
          page stays honest.
        </p>
      </KnowledgeLayout>
    </>
  );
}
