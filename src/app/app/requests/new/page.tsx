"use client";

import { SourceButton, SourceLabel } from "@/components/source/ui";
import { api, useSourceQuery } from "@/client/source/api";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CollectionBuilderPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const { data } = useSourceQuery<{
    summary: { missing: number; sourceCanResolve: number; needsYou: number };
  }>("/api/source/workspace");

  return (
    <div className="mx-auto max-w-3xl">
      <SourceLabel>Let SOURCE handle the gaps</SourceLabel>
      <h1 className="mt-2 font-[family-name:var(--font-space)] text-[33px] font-medium tracking-[-0.02em]">
        SOURCE will only contact a supplier when it must.
      </h1>
      <p className="mt-4 text-[14.5px] leading-relaxed text-[#101A15]/70">
        Existing evidence and reuse come first. Unresolved gaps become a single request per supplier, not one email per product.
      </p>
      <dl className="mt-8 space-y-3 text-[13px]">
        <div className="flex justify-between border-b border-[#101A15]/8 py-2">
          <dt className="text-[#101A15]/55">Still missing</dt>
          <dd>{data?.summary.missing ?? "—"}</dd>
        </div>
        <div className="flex justify-between border-b border-[#101A15]/8 py-2">
          <dt className="text-[#101A15]/55">SOURCE can continue</dt>
          <dd>{data?.summary.sourceCanResolve ?? "—"}</dd>
        </div>
        <div className="flex justify-between border-b border-[#101A15]/8 py-2">
          <dt className="text-[#101A15]/55">Needs you first</dt>
          <dd>{data?.summary.needsYou ?? "—"}</dd>
        </div>
      </dl>
      {status ? <p className="mt-6 text-[13px] text-[#0B6E50]">{status}</p> : null}
      <div className="mt-8 flex flex-wrap gap-2">
        <SourceButton
          onClick={() =>
            void api<{ emailsQueued?: number }>("/api/source/resolution-run", { method: "POST", body: "{}" }).then((result) => {
              setStatus(
                result.emailsQueued
                  ? "Requests queued. SOURCE will email suppliers shortly."
                  : "SOURCE is working the gaps. No new supplier email was needed."
              );
              router.push("/app/pilot");
            })
          }
        >
          Let SOURCE handle the gaps
        </SourceButton>
        <SourceButton href="/app/import" variant="ghost">
          Upload catalogue first
        </SourceButton>
      </div>
    </div>
  );
}
