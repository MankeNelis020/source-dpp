import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/source/json-ld";
import { articleNode, graph } from "@/lib/seo/jsonld";
import { KnowledgeLayout } from "@/components/source/knowledge-layout";
import { AnswerBlock, FactBlock } from "@/components/source/knowledge";
import { Citation, SourceList } from "@/components/source/citation";
import { catalogByPath } from "@/lib/seo/catalog";

const path = "/digital-product-passport/espr";
const page = catalogByPath(path)!;

export const metadata: Metadata = pageMetadata(path);

export default function EsprPage() {
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
          { name: "ESPR", path },
        ]}
        title="ESPR and the Digital Product Passport"
        lede="The Ecodesign for Sustainable Products Regulation is the EU framework under which Digital Product Passports are being introduced for many physical goods. It is not a finished list of fields and dates for every product."
        published="18 August 2026"
        reviewed="18 August 2026"
        related={[
          { href: "/digital-product-passport/what-is-a-dpp", label: "What is a DPP?" },
          { href: "/digital-product-passport/who-is-responsible", label: "Who is responsible" },
          { href: "/resources/glossary", label: "Glossary" },
        ]}
      >
        <AnswerBlock
          question="What is ESPR?"
          answer="Regulation (EU) 2024/1781 is a framework regulation for setting ecodesign requirements for sustainable products. It has applied since 18 July 2024. It replaces and enlarges the previous ecodesign directive. Digital Product Passport rules for a given product group are specified in later measures, typically delegated acts, not as one universal obligation in the ESPR text."
        >
          <Citation source="espr" />
        </AnswerBlock>

        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          Framework versus product obligations
        </h2>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-ink/10">
              <th className="py-2 font-medium">Layer</th>
              <th className="py-2 font-medium">What it does</th>
              <th className="py-2 font-medium">What it does not do</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-ink/8 align-top">
              <td className="py-2">ESPR (2024/1781)</td>
              <td className="py-2 text-ink/70">
                Creates the legal basis for ecodesign requirements and the DPP concept.
              </td>
              <td className="py-2 text-ink/70">
                Does not, by itself, tell you the DPP field list or the compliance date for a chair
                or a t-shirt.
              </td>
            </tr>
            <tr className="border-b border-ink/8 align-top">
              <td className="py-2">Delegated acts / product measures</td>
              <td className="py-2 text-ink/70">
                Can set requirements, information and DPP rules for a product group.
              </td>
              <td className="py-2 text-ink/70">
                Are not all adopted. Do not invent a date because a working plan mentions a sector.
              </td>
            </tr>
            <tr className="align-top">
              <td className="py-2">Batteries regulation (2023/1542)</td>
              <td className="py-2 text-ink/70">
                Contains battery-passport rules in a separate instrument.
              </td>
              <td className="py-2 text-ink/70">
                Is not a substitute for reading ESPR product-group acts for other goods.
              </td>
            </tr>
          </tbody>
        </table>

        <FactBlock kind="regulation">
          EUR-Lex records that the ESPR has applied since 18 July 2024 and enables further
          product-specific measures. Always read the authentic Official Journal text.
        </FactBlock>
        <FactBlock kind="interpretation">
          “ESPR is in force” is not the same as “our entire catalogue needs a DPP this year.”
          Working plans describe Commission priorities; they are not a substitute for an adopted
          product-group act.
        </FactBlock>
        <FactBlock kind="recommendation">
          Keep a register of which product families you believe may fall under upcoming measures,
          and collect evidence that those measures are likely to need — without claiming SOURCE has
          classified your SKUs as legally in scope. See{" "}
          <Link href="/digital-product-passport/dpp-readiness" className="underline-offset-4 hover:underline">
            DPP readiness
          </Link>
          .
        </FactBlock>

        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          Primary sources
        </h2>
        <SourceList ids={["espr", "esprSummary", "batteries"]} />
      </KnowledgeLayout>
    </>
  );
}
