"use client";

import { useEffect, useState } from "react";
import { EvidenceLine, Mono, SourceLabel, StatusPill } from "./ui";

const ALIASES = ["SUP-2044", "Nordform", "Nordform Metals", "Nordform Metals GmbH", "EU-NF448210"];

export function IdentityDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % (ALIASES.length + 8)), 700);
    return () => clearInterval(id);
  }, []);

  const resolved = step > ALIASES.length + 1;

  return (
    <div className="border border-ink/8 bg-card p-6">
      <SourceLabel>Illustrative identity reconciliation</SourceLabel>
      <p className="mt-2 text-[12px] leading-relaxed text-ink/55">
        Fictional supplier used for demonstration. Not a real company.
      </p>
      <ul className="mt-4 space-y-2 font-[family-name:var(--font-plex)] text-[13px]">
        {ALIASES.map((alias, i) => (
          <li key={alias} className={step >= i ? "text-ink" : "text-ink/25"}>
            {alias}
          </li>
        ))}
      </ul>
      <div className="mt-6 border-t border-ink/8 pt-4">
        <div className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em]">
          Nordform Metals GmbH
        </div>
        <EvidenceLine className={resolved ? undefined : "bg-l0"} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusPill tone={resolved ? "signal" : "muted"}>
            {resolved ? "Identity reconciled" : "Uncertain identity"}
          </StatusPill>
          <Mono className="text-[11px] text-ink/50">VAT EU-NF448210 · fictional</Mono>
        </div>
        <p className="mt-6 text-[13px] leading-relaxed text-ink/70">
          Different aliases. Same actor. SOURCE scores matches and keeps uncertain identities
          visible instead of guessing the responsible supplier.
        </p>
      </div>
    </div>
  );
}
