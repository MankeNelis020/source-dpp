import type { Metadata } from "next";
import { EvidenceLine, SourceButton, SourceLabel } from "@/components/source/ui";

export const metadata: Metadata = { title: "Product" };

export default function ProductPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
      <SourceLabel>Product</SourceLabel>
      <h1 className="mt-4 max-w-2xl font-[family-name:var(--font-space)] text-[40px] font-medium leading-[1.08] tracking-[-0.02em] md:text-[48px]">
        One workflow. Not a feature list.
      </h1>
      <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-ink/70">
        A manufacturer should not feel they are building a supply-chain database. They should feel:
        I connect my existing administration. SOURCE tells me what we know, what is missing, and who
        to ask.
      </p>

      <div className="mt-16 grid gap-6 md:grid-cols-3">
        <FlowCol title="Your systems" items={["SAP", "PIM", "PLM", "CSV"]} />
        <FlowCol
          title="SOURCE"
          accent
          items={["Identity", "Claims", "Evidence", "Permissions"]}
        />
        <FlowCol title="Your outputs" items={["ERP", "DPP", "Compliance", "Procurement", "API"]} />
      </div>

      <div className="mt-20 grid gap-8 md:grid-cols-2">
        <Module title="Catalogue Sync" body="Connect ERP, PIM, PLM or upload CSV/XLSX. Imports run asynchronously; SOURCE never asks the browser to process 80,000 products." />
        <Module title="Identity Resolution" body="Normalize names and identifiers, score candidates, auto-match at high confidence, send the rest to human review. Precision before recall." />
        <Module title="Supplier Collection" body="Gaps are grouped per supplier and product family. SOURCE requests 24 actions, not 143 emails." />
        <Module title="Evidence Ledger" body="Original documents are immutable. SHA-256, issuer, validity, linked claims, extraction runs and audit history." />
        <Module title="Permissioned Reuse" body="A claim is reusable only when identity, evidence, audience, purpose and consent all pass. Reuse is never implicit." />
        <Module title="Exports & API" body="Open formats. Versioned API. A customer can leave SOURCE with products, actors, claims, evidence metadata, permissions and audit history." />
      </div>

      <div className="mt-16">
        <SourceButton href="/signup">Connect your supply chain</SourceButton>
      </div>
    </div>
  );
}

function FlowCol({
  title,
  items,
  accent,
}: {
  title: string;
  items: string[];
  accent?: boolean;
}) {
  return (
    <div className="border border-ink/8 bg-card p-6">
      <SourceLabel>{title}</SourceLabel>
      {accent ? <EvidenceLine className="mt-2" /> : null}
      <ul className="mt-4 space-y-2 font-[family-name:var(--font-plex)] text-[13px]">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Module({ title, body }: { title: string; body: string }) {
  return (
    <article>
      <EvidenceLine />
      <h2 className="mt-4 font-[family-name:var(--font-space)] text-[20px] tracking-[-0.02em]">
        {title}
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink/70">{body}</p>
    </article>
  );
}
