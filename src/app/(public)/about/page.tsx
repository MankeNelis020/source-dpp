import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/source/json-ld";
import { graph, personResearchNode } from "@/lib/seo/jsonld";
import { KnowledgeLayout } from "@/components/source/knowledge-layout";
import { SOURCE_DEFINITION, SOURCE_DOES_NOT } from "@/lib/seo/site";

export const metadata: Metadata = pageMetadata("/about");

export default function AboutPage() {
  return (
    <>
      <JsonLd data={graph([personResearchNode()])} />
      <KnowledgeLayout
        crumbs={[{ name: "About", path: "/about" }]}
        title="About SOURCE"
        lede={SOURCE_DEFINITION}
        published="18 August 2026"
        reviewed="18 August 2026"
        related={[
          { href: "/methodology", label: "How SOURCE assesses evidence" },
          { href: "/digital-product-passport", label: "Digital Product Passport hub" },
          { href: "/product", label: "Product" },
        ]}
      >
        <p>
          SOURCE exists because product information for compliance is usually already somewhere —
          in ERP, PIM, certificates, inboxes and supplier files — and is rarely complete enough to
          stand behind a Digital Product Passport. The first job is not to design a QR code. It is
          to see which records exist, which are missing, and who can supply the gap.
        </p>
        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          What we build
        </h2>
        <p>
          The clickable product in this repository is a discovery workspace: catalogue connection,
          identity resolution, coverage and missing claims, supplier requests with a magic link, an
          evidence ledger, and permissioned reuse. {SOURCE_DOES_NOT}
        </p>
        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          Where we are
        </h2>
        <p>
          SOURCE is based in Amsterdam, in the European Union, because the Digital Product Passport
          is being defined in EU product law. Knowledge pages cite{" "}
          <Link href="/digital-product-passport/espr" className="underline-offset-4 hover:underline">
            Regulation (EU) 2024/1781
          </Link>{" "}
          and related primary texts. They are written by{" "}
          <Link href="/authors/source-research" className="underline-offset-4 hover:underline">
            SOURCE Research
          </Link>
          , not by a named solicitor. They are not legal advice.
        </p>
        <h2 className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em] text-ink">
          Contact
        </h2>
        <p>
          For a catalogue walkthrough, use{" "}
          <Link href="/signup" className="underline-offset-4 hover:underline">
            Check my catalogue
          </Link>
          . The demo workspace at{" "}
          <Link href="/app" className="underline-offset-4 hover:underline">
            /app
          </Link>{" "}
          is a private illustration with sample data and is not indexed.
        </p>
      </KnowledgeLayout>
    </>
  );
}
