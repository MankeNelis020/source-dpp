"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COLLECTION_ANALYSIS } from "@/lib/source/demo-data";
import { EvidenceLine, Metric, SourceButton, SourceLabel } from "@/components/source/ui";

export default function CollectionBuilderPage() {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const a = COLLECTION_ANALYSIS;

  return (
    <div className="mx-auto max-w-3xl">
      <SourceLabel>Collection builder</SourceLabel>
      <h1 className="mt-2 font-[family-name:var(--font-space)] text-[33px] font-medium tracking-[-0.02em]">
        Request product information
      </h1>
      <dl className="mt-8 space-y-3 text-[13px]">
        <div className="flex justify-between border-b border-ink/8 py-2">
          <dt className="text-ink/55">Supplier</dt>
          <dd>{a.supplier}</dd>
        </div>
        <div className="flex justify-between border-b border-ink/8 py-2">
          <dt className="text-ink/55">Scope</dt>
          <dd>{a.scope}</dd>
        </div>
        <div className="flex justify-between border-b border-ink/8 py-2">
          <dt className="text-ink/55">Dataset</dt>
          <dd className="font-[family-name:var(--font-plex)] text-[12px]">{a.dataset}</dd>
        </div>
      </dl>

      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        <Metric value={String(a.required)} label="Required claims" />
        <Metric value={String(a.alreadyAvailable)} label="Already available" />
        <Metric value={String(a.actions)} label="Actions to request" />
      </div>
      <p className="mt-6 text-[14.5px] leading-relaxed text-ink/70">
        {a.reusable} reusable · {a.requireAuthorization} require authorization · {a.missing} missing.
        SOURCE will request {a.actions} actions, not {a.required}.
      </p>
      <EvidenceLine className="mt-8 w-16" />
      {sent ? (
        <p className="mt-8 text-[13px] text-signal">
          Request sent. Supplier A receives one magic link — not 318 mails.
        </p>
      ) : (
        <SourceButton
          className="mt-8"
          onClick={() => {
            setSent(true);
            setTimeout(() => router.push("/app/requests/req-supplier-a"), 800);
          }}
        >
          Send request
        </SourceButton>
      )}
    </div>
  );
}
