import type { Metadata } from "next";
import { EvidenceLine, SourceButton, SourceLabel } from "@/components/source/ui";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata("/how-it-works");

const STEPS = [
  {
    n: "01",
    title: "Connect what you already have",
    body: "SAP, Dynamics, PIM, PLM, CSV or API. SOURCE imports supplier master, product master, identifiers and BOM relations where they exist.",
  },
  {
    n: "02",
    title: "Resolve identities first",
    body: "Names, VAT, LEI, GTIN, domains and graph context are scored. High confidence matches automatically. Medium goes to review. Low stays unresolved. Nothing is merged in doubt.",
  },
  {
    n: "03",
    title: "Show coverage, not charts",
    body: "Products imported, supplier relationships, identity resolved, evidence covered, immediately reusable, authorization required, missing claims, expiring evidence.",
  },
  {
    n: "04",
    title: "Collect only the gaps",
    body: "A dataset such as ESPR Aluminium 2027 defines required properties. SOURCE groups missing claims per supplier. One request. Magic link. No account wall.",
  },
  {
    n: "05",
    title: "Prove, then permit",
    body: "AI proposes candidate claims with model version, page and confidence. Humans review. Verified is never set by the model. Reuse requires an auditable grant.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 md:py-24">
      <SourceLabel>How it works</SourceLabel>
      <h1 className="mt-4 font-[family-name:var(--font-space)] text-[40px] font-medium leading-[1.08] tracking-[-0.02em]">
        The user sees simplicity. SOURCE processes complexity.
      </h1>
      <p className="mt-4 text-[14.5px] leading-relaxed text-ink/70">
        Manufacturers connect, review exceptions, and take action. Suppliers answer, attach
        evidence, and set permission. Identity, provenance, bitemporality and consent stay
        underneath.
      </p>
      <ol className="mt-16 space-y-12">
        {STEPS.map((step) => (
          <li key={step.n}>
            <SourceLabel>{step.n}</SourceLabel>
            <h2 className="mt-2 font-[family-name:var(--font-space)] text-[20px] tracking-[-0.02em]">
              {step.title}
            </h2>
            <EvidenceLine className="mt-3" />
            <p className="mt-3 text-[13px] leading-relaxed text-ink/70">{step.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-16 flex flex-wrap gap-3">
        <SourceButton href="/app">See the workspace</SourceButton>
        <SourceButton href="/signup" variant="ghost">
          Connect your catalogue
        </SourceButton>
      </div>
    </div>
  );
}
