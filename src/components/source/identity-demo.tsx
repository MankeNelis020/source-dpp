"use client";

import { useEffect, useState } from "react";
import { EvidenceLine, Mono, SourceLabel, StatusPill } from "./ui";

const ALIASES = ["SUP-4471", "Bosch", "Robert Bosch GmbH", "Bosch GmbH", "DE811128135"];

export function IdentityDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % (ALIASES.length + 8)), 700);
    return () => clearInterval(id);
  }, []);

  const resolved = step > ALIASES.length + 1;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="border border-[#101A15]/10 bg-[#FBFCFA] p-6">
        <SourceLabel>Source records</SourceLabel>
        <ul className="mt-4 space-y-2 font-[family-name:var(--font-plex)] text-[13px]">
          {ALIASES.map((alias, i) => (
            <li
              key={alias}
              className={step >= i ? "text-[#101A15]" : "text-[#101A15]/25"}
            >
              {alias}
            </li>
          ))}
        </ul>
      </div>
      <div className="border border-[#101A15]/10 bg-[#FBFCFA] p-6">
        <SourceLabel>Canonical actor</SourceLabel>
        <div className="mt-4">
          <div className="font-[family-name:var(--font-space)] text-[22px] tracking-[-0.02em]">
            Robert Bosch GmbH
          </div>
          <EvidenceLine className={resolved ? undefined : "bg-[#AEB4AF]"} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusPill tone={resolved ? "signal" : "muted"}>
              {resolved ? "99.7% identity confidence" : "Resolving…"}
            </StatusPill>
            <Mono className="text-[11px] text-[#101A15]/50">VAT DE811128135</Mono>
          </div>
          <p className="mt-6 text-[14.5px] leading-relaxed text-[#101A15]/70">
            Different systems. Same supplier. SOURCE resolves messy supplier and product
            identities before collecting new information.
          </p>
        </div>
      </div>
    </div>
  );
}
