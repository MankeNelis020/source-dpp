import type { Metadata } from "next";
import Link from "next/link";
import { HeroGraph } from "@/components/source/hero-graph";
import { IdentityDemo } from "@/components/source/identity-demo";
import {
  ClaimCard,
  EvidenceLine,
  Metric,
  SourceButton,
  SourceLabel,
  StatusPill,
} from "@/components/source/ui";
import { pageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/source/json-ld";
import { faqPageNode, graph, softwareNode } from "@/lib/seo/jsonld";
import { FaqList } from "@/components/source/knowledge";
import { SOURCE_DEFINITION, SOURCE_DOES_NOT } from "@/lib/seo/site";

export const metadata: Metadata = pageMetadata("/");

const faqs = [
  {
    q: "What is SOURCE?",
    a: SOURCE_DEFINITION,
  },
  {
    q: "Does SOURCE create Digital Product Passports?",
    a: "SOURCE prepares the catalogue record: identity, evidence, missing data and supplier collection. Publishing a passport or QR code is not the current product. A Digital Product Passport is an output of a complete record.",
  },
  {
    q: "Who is SOURCE for?",
    a: "European manufacturers, importers and private-label brands that already have ERP or PIM data, hundreds or thousands of SKUs, and a supplier network — without an enterprise compliance stack. Not every retailer is the responsible economic operator.",
  },
  {
    q: "Can SOURCE analyse a large product portfolio?",
    a: "The workspace is designed around catalogue coverage, missing claims and grouped supplier requests rather than one-by-one SKU forms. The hosted demo uses sample data; it is not a live scan of your file until you connect a catalogue.",
  },
];

export default function HomePage() {
  return (
    <>
      <JsonLd data={graph([softwareNode(), faqPageNode(faqs)])} />

      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-2 md:items-center md:gap-0 md:divide-x md:divide-ink/8 md:py-28">
        <div className="md:pr-12">
          <SourceLabel>Digital Product Passport readiness software</SourceLabel>
          <h1 className="mt-5 font-[family-name:var(--font-space)] text-[40px] font-medium leading-[1.05] tracking-[-0.02em] text-ink md:text-[56px]">
            Your product data isn&apos;t DPP-ready. SOURCE gets it there.
          </h1>
          <p className="mt-6 max-w-lg text-[16px] leading-relaxed text-ink">
            {SOURCE_DEFINITION}
          </p>
          <p className="mt-4 max-w-lg text-[14.5px] leading-relaxed text-ink/70">
            Import your catalogue. SOURCE shows what evidence you already have, what is missing, and
            who should provide it.{" "}
            <Link
              href="/digital-product-passport"
              className="underline decoration-ink/20 underline-offset-4 hover:decoration-signal"
            >
              Digital Product Passports
            </Link>{" "}
            follow from that process — they are not the starting point.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <SourceButton href="/signup">Check my catalogue</SourceButton>
            <SourceButton href="/how-it-works" variant="ghost">
              See how SOURCE works
            </SourceButton>
          </div>
        </div>
        <div className="space-y-4 md:pl-12">
          <ClaimCard />
          <HeroGraph />
        </div>
      </section>

      <section className="border-y border-ink/8 bg-card">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SourceLabel>Illustrative workspace view — not a customer result</SourceLabel>
          <h2 className="mt-4 max-w-2xl font-[family-name:var(--font-space)] text-[28px] font-medium tracking-[-0.02em] md:text-[33px]">
            10,000 products. Which ones actually need attention?
          </h2>
          <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-ink/70">
            SOURCE is built for catalogues, not for typing one SKU into a passport form. The figures
            below are an example of how coverage can be shown in the product UI.
          </p>
          <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <Metric value="10,000" label="Products scanned" hint="Example UI" />
            <Metric value="2,341" label="Require follow-up" hint="Example UI" />
            <Metric value="781" label="Missing supplier evidence" hint="Example UI" />
            <Metric value="355" label="Supplier request needed" hint="Example UI" />
          </div>
          <p className="mt-10 max-w-xl text-[13px] leading-relaxed text-ink/55">
            The live demo workspace uses the Urban Chair sample set (8,421 products in the snapshot),
            not these round numbers. {SOURCE_DOES_NOT}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <SourceLabel>SOURCE starts before the passport</SourceLabel>
        <h2 className="mt-4 max-w-2xl font-[family-name:var(--font-space)] text-[28px] font-medium tracking-[-0.02em] md:text-[33px]">
          Typical DPP software fills a form. SOURCE works the catalogue.
        </h2>
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-ink/10">
                <th className="py-3 pr-4 font-medium">Stage</th>
                <th className="py-3 pr-4 font-medium">Typical DPP tool</th>
                <th className="py-3 font-medium">SOURCE</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Start", "Add a product", "Connect ERP, PIM or CSV"],
                ["Identity", "Type the name again", "Resolve products and suppliers first"],
                ["Requirements", "Blank fields", "Dataset of required claims; subtract what exists"],
                ["Evidence", "Upload if you remember", "Ledger with issuer, hash, validity, permission"],
                ["Gaps", "You notice later", "Missing claims grouped per supplier"],
                ["Collection", "Email the factory", "One request, magic link, reuse rules"],
                ["Output", "QR / passport file", "Evidence-ready record; DPP is a later output"],
              ].map((row) => (
                <tr key={row[0]} className="border-b border-ink/8 align-top">
                  <td className="py-3 pr-4 font-[family-name:var(--font-plex)] text-[12px] text-ink/55">
                    {row[0]}
                  </td>
                  <td className="py-3 pr-4 text-ink/70">{row[1]}</td>
                  <td className="py-3 text-ink">{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <EvidenceLine />
        <SourceLabel className="mt-4 block">Identity resolution</SourceLabel>
        <h2 className="mt-4 max-w-xl font-[family-name:var(--font-space)] text-[28px] font-medium tracking-[-0.02em] md:text-[33px]">
          Different systems. Same supplier.
        </h2>
        <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink/70">
          SOURCE resolves messy supplier and product identities before collecting new information.
          Precision before automation.
        </p>
        <div className="mt-10">
          <IdentityDemo />
        </div>
      </section>

      <section className="mt-20 bg-ink text-card">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 md:grid-cols-2 md:items-center md:gap-0 md:divide-x md:divide-card/10">
          <div className="md:pr-12">
            <SourceLabel className="text-card/50">For suppliers</SourceLabel>
            <h2 className="mt-4 font-[family-name:var(--font-space)] text-[33px] font-medium tracking-[-0.02em]">
              Let SOURCE do the talking.
            </h2>
            <p className="mt-4 text-[14.5px] leading-relaxed text-card/70">
              Missing requirement → likely evidence owner → supplier request → evidence in → human
              review → ready or still unresolved. Suppliers answer once and set reuse permission.
            </p>
            <div className="mt-8">
              <SourceButton href="/suppliers" variant="ghost" className="text-card ring-card/20">
                SOURCE for suppliers
              </SourceButton>
            </div>
          </div>
          <article className="border border-card/12 p-8 md:ml-12">
            <SourceLabel className="text-card/50">Recycling claim</SourceLabel>
            <div className="mt-3 font-[family-name:var(--font-space)] text-[48px] leading-none tracking-[-0.02em]">
              67%
            </div>
            <span className="mt-2 block h-[2.5px] w-16 bg-signal" />
            <div className="mt-4">
              <StatusPill tone="signal">Evidence available</StatusPill>
            </div>
            <p className="mt-6 font-[family-name:var(--font-plex)] text-[12px] text-card/70">
              subject AL-FRAME-881 · verified customers may reuse
            </p>
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="max-w-xl font-[family-name:var(--font-space)] text-[28px] font-medium tracking-[-0.02em] md:text-[33px]">
          Built for the EU Digital Product Passport — without pretending the law is finished.
        </h2>
        <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-ink/70">
          <Link href="/digital-product-passport/espr" className="underline-offset-4 hover:underline">
            ESPR (Regulation 2024/1781)
          </Link>{" "}
          is a framework. Product-group rules come later. SOURCE helps you get the evidence layer in
          order while those rules arrive. Read the{" "}
          <Link href="/digital-product-passport" className="underline-offset-4 hover:underline">
            Digital Product Passport hub
          </Link>
          ,{" "}
          <Link href="/methodology" className="underline-offset-4 hover:underline">
            methodology
          </Link>{" "}
          and{" "}
          <Link href="/about" className="underline-offset-4 hover:underline">
            about SOURCE
          </Link>
          .
        </p>
      </section>

      <section className="border-t border-ink/8">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <SourceLabel>FAQ</SourceLabel>
          <h2 className="mt-4 font-[family-name:var(--font-space)] text-[28px] tracking-[-0.02em]">
            Short answers
          </h2>
          <div className="mt-10 max-w-3xl">
            <FaqList items={faqs} />
          </div>
          <div className="mt-14 flex flex-wrap gap-3">
            <SourceButton href="/signup">Check my catalogue</SourceButton>
            <SourceButton href="/app" variant="ghost">
              Open the demo workspace
            </SourceButton>
          </div>
        </div>
      </section>
    </>
  );
}
