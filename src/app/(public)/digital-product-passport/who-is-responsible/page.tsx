import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/source/json-ld";
import { articleNode, faqPageNode, graph } from "@/lib/seo/jsonld";
import { KnowledgeLayout } from "@/components/source/knowledge-layout";
import { AnswerBlock, FactBlock, FaqList } from "@/components/source/knowledge";
import { Citation } from "@/components/source/citation";
import { catalogByPath } from "@/lib/seo/catalog";

const path = "/digital-product-passport/who-is-responsible";
const page = catalogByPath(path)!;

export const metadata: Metadata = pageMetadata(path);

const faqs = [
  {
    q: "Is the manufacturer always responsible for a Digital Product Passport?",
    a: "No. Responsibility depends on who acts as the relevant economic operator for the product on the EU market and on the product-group rules. An importer of a good manufactured outside the EU often carries obligations that a purely domestic manufacturer would carry in another chain.",
  },
  {
    q: "Does a retailer always need to create a DPP?",
    a: "No. A retailer that only distributes goods already placed on the market by another operator is not automatically the operator that must create the passport. A retailer that imports, or that sells private-label goods as manufacturer, may be in a different position. This is not a SOURCE classification of your contracts.",
  },
];

export default function ResponsibilityPage() {
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
        crumbs={[
          { name: "Digital Product Passport", path: "/digital-product-passport" },
          { name: "Who is responsible", path },
        ]}
        title="Who is responsible for a Digital Product Passport?"
        lede="Responsibility is not a slogan. It follows the economic operator who places the relevant product on the EU market and the requirements defined for that product group."
        published="18 August 2026"
        reviewed="18 August 2026"
        related={[
          { href: "/digital-product-passport/espr", label: "ESPR" },
          { href: "/digital-product-passport/dpp-readiness", label: "DPP readiness" },
          { href: "/resources/glossary", label: "Glossary" },
        ]}
      >
        <AnswerBlock
          question="Who is responsible for creating a Digital Product Passport?"
          answer="Under the ESPR framework, obligations attach to economic operators. Which operator must provide which information is specified in the applicable product-group measure. Manufacturer, authorised representative, importer, distributor and fulfilment-service provider are distinct roles. Private-label arrangements can shift who is treated as manufacturer. SOURCE does not decide your legal role."
        >
          <Citation source="espr" />
        </AnswerBlock>

        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          Roles (operational reading)
        </h2>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-ink/10">
              <th className="py-2 font-medium">Role</th>
              <th className="py-2 font-medium">Typical question</th>
              <th className="py-2 font-medium">Do not assume</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-ink/8 align-top">
              <td className="py-2">Manufacturer</td>
              <td className="py-2 text-ink/70">Did we make the product and place it on the Union market?</td>
              <td className="py-2 text-ink/70">That a brand name on the box always equals manufacturer.</td>
            </tr>
            <tr className="border-b border-ink/8 align-top">
              <td className="py-2">Importer</td>
              <td className="py-2 text-ink/70">Did we first place a third-country product on the Union market?</td>
              <td className="py-2 text-ink/70">That the foreign factory will carry the EU information duty.</td>
            </tr>
            <tr className="border-b border-ink/8 align-top">
              <td className="py-2">Distributor / retailer</td>
              <td className="py-2 text-ink/70">Do we only make the product available, or do we also import or own the brand?</td>
              <td className="py-2 text-ink/70">That every retailer must create a DPP for every SKU.</td>
            </tr>
            <tr className="align-top">
              <td className="py-2">Private-label brand owner</td>
              <td className="py-2 text-ink/70">Are we presenting ourselves as manufacturer?</td>
              <td className="py-2 text-ink/70">That the contract manufacturer is automatically the responsible operator in the EU.</td>
            </tr>
          </tbody>
        </table>

        <FactBlock kind="regulation">
          Read the definitions and operator duties in the authentic ESPR text and in any product-group
          act that applies. Do not rely on this table as a legal determination.
        </FactBlock>
        <FactBlock kind="interpretation">
          For mid-market catalogues, the practical failure mode is not “we forgot the QR code”. It
          is that procurement, quality and the supplier each hold a fragment of the record, and
          nobody can say who must produce the next evidence item.
        </FactBlock>
        <FactBlock kind="recommendation">
          Map each product family to a hypothesized operator role, then collect evidence as if that
          hypothesis must be auditable. SOURCE can record identity, claims and supplier requests; it
          cannot certify the hypothesis. See{" "}
          <Link href="/methodology" className="underline-offset-4 hover:underline">
            methodology
          </Link>
          .
        </FactBlock>

        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          FAQ
        </h2>
        <FaqList items={faqs} />
      </KnowledgeLayout>
    </>
  );
}
