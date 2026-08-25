import type { Metadata } from "next";
import { SourceLinkButton } from "@/components/source/ui";
import { PageHero, Section, SectionHeader } from "@/components/source/knowledge";
import { SourceJsonLd } from "@/components/source/source-json-ld";
import { PRIMARY_CTA, READINESS_GATES } from "@/lib/source/copy";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata("/product");

export default function ProductPage() {
  return (
    <>
      <SourceJsonLd path="/product" />
      <article>
        <PageHero
          kicker="Product"
          title="Seven gates between a stored value and a READY record."
          lead="SOURCE does not treat a number, a PDF, or a supplier logo as proof. Identity, evidence, scope, validity, permission, and conflicts are reviewed separately. Unresolved outcomes stay unresolved."
        >
          <SourceLinkButton href={PRIMARY_CTA.href}>{PRIMARY_CTA.label}</SourceLinkButton>
        </PageHero>

        <Section>
          <SectionHeader
            kicker="Readiness gates"
            title="READY only when every applicable gate passes."
            lead="Gates can be not applicable for a given claim. They are never silently skipped when they apply. SOURCE records the outcome; it does not independently certify evidence."
          />
          <ol className="mt-10 space-y-4">
            {READINESS_GATES.map((gate, i) => (
              <li
                key={gate.title}
                className="grid gap-2 border border-ink/8 bg-card p-5 md:grid-cols-[4.5rem_1fr]"
              >
                <p className="font-[family-name:var(--font-plex)] text-[11px] font-medium uppercase tracking-[0.14em] text-ink/55">
                  Gate {i + 1}
                </p>
                <div>
                  <h3 className="font-[family-name:var(--font-space)] text-base tracking-[-0.02em] text-ink">
                    {gate.title}
                  </h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink/70">{gate.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section className="bg-paper">
          <SectionHeader
            kicker="Architecture"
            title="Input, resolution, output — without becoming the catalogue."
            lead="SOURCE consumes product identity and claim values from existing systems, resolves evidence against those claims, and returns readiness plus unresolved reasons. Master data stays where it already lives."
          />
          <div className="mt-10 grid gap-px overflow-hidden border border-ink/8 bg-ink/8 md:grid-cols-3">
            {[
              {
                title: "Input",
                body: "Product identities, claim values, and existing files imported from ERP, PIM, PLM, or spreadsheets. SOURCE does not become another master-data system.",
              },
              {
                title: "Resolution",
                body: "Gap identification, reuse when identity, scope, validity, and permission allow, and prepared requests to a responsible supplier or internal owner. Uncertain identities remain visible.",
              },
              {
                title: "Output",
                body: "READY or UNRESOLVED records with reasons, plus export of the evidence trail for review in downstream systems. SOURCE does not publish passports from this output.",
              },
            ].map((col) => (
              <div key={col.title} className="bg-card p-6">
                <h3 className="font-[family-name:var(--font-space)] text-base tracking-[-0.02em] text-ink">
                  {col.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink/70">{col.body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section>
          <SectionHeader
            kicker="Distinctions"
            title="Values, evidence, permission, and unresolved outcomes are different objects."
            lead="A recycled-content percentage is a value. A mill certificate is evidence. A recorded licence to reuse that certificate is permission. A declined supplier request is an unresolved outcome — not missing data to be filled in by assumption."
          />
          <div className="mt-8 overflow-x-auto border border-ink/8">
            <table className="w-full min-w-[36rem] text-left text-[13px]">
              <thead className="bg-card font-[family-name:var(--font-plex)] text-[11px] uppercase tracking-[0.12em] text-ink/55">
                <tr>
                  <th className="px-4 py-3 font-medium">Object</th>
                  <th className="px-4 py-3 font-medium">What it is</th>
                  <th className="px-4 py-3 font-medium">What it is not</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/8 text-ink">
                <tr>
                  <td className="px-4 py-3 font-medium">Value</td>
                  <td className="px-4 py-3 text-ink/70">A claim figure stored on the product record.</td>
                  <td className="px-4 py-3 text-ink/70">Proof that the figure is evidenced.</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Evidence</td>
                  <td className="px-4 py-3 text-ink/70">
                    A file, statement, or reference attached to that value.
                  </td>
                  <td className="px-4 py-3 text-ink/70">Permission to reuse it on another SKU or channel.</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Permission</td>
                  <td className="px-4 py-3 text-ink/70">
                    Recorded reuse rights for a named identity and scope.
                  </td>
                  <td className="px-4 py-3 text-ink/70">Implied by possession of the file.</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Unresolved</td>
                  <td className="px-4 py-3 text-ink/70">
                    Decline, uncertainty, denial, conflict, or no response.
                  </td>
                  <td className="px-4 py-3 text-ink/70">A temporary empty field waiting to be guessed.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      </article>
    </>
  );
}
