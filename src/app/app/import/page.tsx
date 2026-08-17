"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EvidenceLine, Metric, SourceButton, SourceLabel } from "@/components/source/ui";

const STEPS = ["Upload", "Detect", "Map", "Resolve", "Connected"] as const;

export default function ImportWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  return (
    <div className="mx-auto max-w-2xl">
      <SourceLabel>Import</SourceLabel>
      <h1 className="mt-2 font-[family-name:var(--font-space)] text-[33px] font-medium tracking-[-0.02em]">
        {STEPS[step]}
      </h1>
      <div className="mt-4 flex gap-2">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={`h-1 flex-1 ${i <= step ? "bg-signal" : "bg-ink/10"}`}
          />
        ))}
      </div>

      {step === 0 ? (
        <div className="mt-8 space-y-2 font-[family-name:var(--font-plex)] text-[13px]">
          <p>products.xlsx</p>
          <p>suppliers.xlsx</p>
          <p>bom.xlsx</p>
          <p className="text-ink/50">SOURCE analyses the files. Column mapping is proposed; you correct only doubt.</p>
        </div>
      ) : null}
      {step === 1 ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <Metric value="8,421" label="Products" />
          <Metric value="684" label="Suppliers" />
          <Metric value="31,882" label="Component relationships" />
        </div>
      ) : null}
      {step === 2 ? (
        <ul className="mt-8 space-y-2 font-[family-name:var(--font-plex)] text-[13px]">
          <li>Supplier_ID → external supplier ID</li>
          <li>VendorName → supplier name</li>
          <li>EAN → GTIN</li>
        </ul>
      ) : null}
      {step === 3 ? (
        <div className="mt-8">
          <p className="text-[14.5px]">Resolving supplier identities…</p>
          <EvidenceLine className="mt-3" />
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <Metric value="493" label="Matched automatically" />
            <Metric value="117" label="Need review" />
            <Metric value="74" label="Unresolved" />
          </div>
        </div>
      ) : null}
      {step === 4 ? (
        <div className="mt-8">
          <h2 className="font-[family-name:var(--font-space)] text-[22px]">Your supply chain is connected.</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-4">
            <Metric value="8,421" label="Products" />
            <Metric value="684" label="Suppliers" />
            <Metric value="72%" label="Resolved automatically" />
            <Metric value="31%" label="Evidence coverage" />
          </div>
        </div>
      ) : null}

      <div className="mt-10 flex gap-2">
        {step < 4 ? (
          <SourceButton onClick={() => setStep((s) => s + 1)}>
            {step === 3 ? "Continue and review later" : "Continue"}
          </SourceButton>
        ) : (
          <SourceButton onClick={() => router.push("/app")}>Find missing data</SourceButton>
        )}
        {step === 3 ? (
          <SourceButton href="/app/reviews" variant="ghost">
            Review matches
          </SourceButton>
        ) : null}
      </div>
    </div>
  );
}
