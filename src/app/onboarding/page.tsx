"use client";

import { useRouter } from "next/navigation";
import { SourceButton, SourceLabel } from "@/components/source/ui";

const OPTIONS = [
  { id: "sap", title: "SAP", group: "Connect a system" },
  { id: "dynamics", title: "Dynamics", group: "Connect a system" },
  { id: "pim", title: "PIM", group: "Connect a system" },
  { id: "plm", title: "PLM", group: "Connect a system" },
  { id: "csv", title: "CSV", group: "Upload files" },
  { id: "xlsx", title: "XLSX", group: "Upload files" },
  { id: "api", title: "Developer setup", group: "Use API" },
];

export default function OnboardingPage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-2xl px-5 py-16 md:py-24">
      <SourceLabel>Onboarding</SourceLabel>
      <h1 className="mt-4 font-[family-name:var(--font-space)] text-[33px] font-medium tracking-[-0.02em]">
        Welcome to SOURCE.
        <br />
        Let&apos;s start with what you already have.
      </h1>
      <p className="mt-3 text-[14.5px] text-[#101A15]/70">
        For a pilot, file upload can be prominent. Native ERP connectors come later.
      </p>
      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => router.push(opt.id === "api" ? "/developers" : "/app/import")}
            className="border border-[#101A15]/10 bg-[#FBFCFA] p-5 text-left hover:border-[#0B6E50]/40"
          >
            <SourceLabel>{opt.group}</SourceLabel>
            <div className="mt-2 font-[family-name:var(--font-space)] text-[20px]">{opt.title}</div>
          </button>
        ))}
      </div>
      <div className="mt-10">
        <SourceButton href="/app" variant="ghost">
          Skip and open the demo workspace
        </SourceButton>
      </div>
    </div>
  );
}
