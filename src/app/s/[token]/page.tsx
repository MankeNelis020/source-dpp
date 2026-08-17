"use client";

import { useState } from "react";
import { SourceWordmark } from "@/components/source/wordmark";
import { EvidenceLine, SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";

export default function SupplierPortalPage() {
  const [step, setStep] = useState<"land" | "form" | "done">("land");
  const [value, setValue] = useState("67");
  const [share, setShare] = useState("verified");
  const [account, setAccount] = useState<"ask" | "skip" | null>(null);

  return (
    <div className="mx-auto min-h-full max-w-lg px-6 py-16">
      <SourceWordmark />
      {step === "land" ? (
        <>
          <h1 className="mt-10 font-[family-name:var(--font-space)] text-[28px] font-medium tracking-[-0.02em]">
            Acme Manufacturing requests product information.
          </h1>
          <p className="mt-3 text-[13px] text-ink/65">
            18 product families · 24 actions · Due 26 Aug
          </p>
          <p className="mt-6 text-[14.5px] leading-relaxed text-ink/70">
            You decide what information may be reused.
          </p>
          <SourceButton className="mt-8" onClick={() => setStep("form")}>
            Start
          </SourceButton>
        </>
      ) : null}

      {step === "form" ? (
        <>
          <SourceLabel className="mt-10">Grouped by family, not by customer SKU</SourceLabel>
          <h1 className="mt-2 font-[family-name:var(--font-space)] text-[24px] tracking-[-0.02em]">
            Aluminium Frame Family AL-88
          </h1>
          <p className="mt-1 text-[13px] text-ink/60">Used in 47 requested products.</p>
          <label className="mt-8 block">
            <SourceLabel>Recycled content</SourceLabel>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-24 border border-ink/15 bg-card px-3 py-2 font-[family-name:var(--font-plex)] text-[16px] outline-none"
              />
              <span className="text-[13px]">%</span>
            </div>
            <EvidenceLine className="mt-2" />
          </label>
          <div className="mt-6">
            <SourceLabel>Evidence</SourceLabel>
            <p className="mt-2 text-[13px] text-ink/65">Upload or use existing evidence.</p>
            <div className="mt-2 flex gap-2">
              <SourceButton variant="ghost">Upload</SourceButton>
              <SourceButton variant="ghost">Use existing evidence</SourceButton>
            </div>
          </div>
          <div className="mt-6">
            <SourceLabel>Who may use this claim?</SourceLabel>
            <div className="mt-3 flex flex-col gap-2">
              {[
                ["verified", "Verified customers"],
                ["request", "Request permission"],
                ["verification", "Verification only"],
                ["private", "Private"],
              ].map(([id, label]) => (
                <label key={id} className="flex items-center gap-2 text-[13px]">
                  <input
                    type="radio"
                    name="share"
                    checked={share === id}
                    onChange={() => setShare(id)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <SourceButton className="mt-8" onClick={() => setStep("done")}>
            Save & continue
          </SourceButton>
        </>
      ) : null}

      {step === "done" ? (
        <>
          <h1 className="mt-10 font-[family-name:var(--font-space)] text-[28px] font-medium tracking-[-0.02em]">
            Save time on future requests.
          </h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink/70">
            Create a free SOURCE supplier account to reuse your evidence and manage permissions.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <SourceButton href="/signup" onClick={() => setAccount("ask")}>
              Create free account
            </SourceButton>
            <SourceButton variant="ghost" onClick={() => setAccount("skip")}>
              Not now
            </SourceButton>
          </div>
          {account === "skip" ? (
            <p className="mt-6 text-[13px] text-signal">
              Request saved. No account wall stood in front of the answer.
            </p>
          ) : null}
          <div className="mt-8">
            <StatusPill tone="signal">Sharing · {share}</StatusPill>
          </div>
        </>
      ) : null}
    </div>
  );
}
