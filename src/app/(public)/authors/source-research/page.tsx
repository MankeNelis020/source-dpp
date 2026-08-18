import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/source/json-ld";
import { graph, personResearchNode } from "@/lib/seo/jsonld";
import { Breadcrumbs } from "@/components/source/breadcrumbs";

export const metadata: Metadata = pageMetadata("/authors/source-research");

export default function AuthorPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 md:py-24">
      <JsonLd data={graph([personResearchNode()])} />
      <Breadcrumbs items={[{ name: "Authors", path: "/about" }, { name: "SOURCE Research", path: "/authors/source-research" }]} />
      <h1 className="mt-6 font-[family-name:var(--font-space)] text-[36px] font-medium tracking-[-0.02em]">
        SOURCE Research
      </h1>
      <p className="mt-5 text-[17px] leading-relaxed text-ink/80">
        SOURCE Research is the editorial desk for knowledge pages on this site. It is a function of
        SOURCE, not a separate law firm and not a named advocate.
      </p>
      <div className="mt-10 space-y-6 text-[14.5px] leading-relaxed text-ink/80">
        <p>
          Pages about{" "}
          <Link href="/digital-product-passport" className="underline-offset-4 hover:underline">
            Digital Product Passports
          </Link>{" "}
          distinguish regulation, SOURCE interpretation and SOURCE product behaviour. Legal
          statements cite EUR-Lex and related official publications. Operational statements describe
          what the SOURCE workspace actually records: identity, claims, evidence, permissions and
          missing data.
        </p>
        <p>
          We do not fabricate credentials, customer counts, certifications or compliance guarantees.
          If a page cannot be sourced, it should not be indexed.
        </p>
        <p>
          <Link href="/methodology" className="underline-offset-4 hover:underline">
            Methodology
          </Link>
          {" · "}
          <Link href="/about" className="underline-offset-4 hover:underline">
            About SOURCE
          </Link>
        </p>
      </div>
    </div>
  );
}
