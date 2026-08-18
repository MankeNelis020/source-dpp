"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState, Mono, SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";
import { useSourceQuery } from "@/client/source/api";

const TABS = ["Overview", "Components", "Requirements"] as const;

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const { data: live, loading, error } = useSourceQuery<{
    id: string;
    name: string;
    kind: string;
    source?: string;
    buckets?: Record<string, number>;
    requirements?: { id: string; propertyLabel: string; state?: string; selectedRouteReason?: string }[];
    children: { id: string; name: string; kind?: string; source?: string; confidence?: number }[];
    blockers: { caseId: string; property: string; actorLabel: string; reason?: string; state: string }[];
  }>(params.id ? `/api/source/products/${params.id}` : null);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState title="Product unavailable" description={error} action={<SourceButton href="/app/products">Back to products</SourceButton>} />
      </div>
    );
  }
  if (!live) return <p className="text-[13px] text-[#101A15]/55">{loading ? "Loading product…" : "Product unavailable."}</p>;

  const ready = live.buckets?.READY ?? 0;
  const open = (live.buckets?.RESOLVING ?? 0) + (live.buckets?.WAITING ?? 0) + (live.buckets?.NEEDS_YOU ?? 0) + (live.buckets?.UNRESOLVED ?? 0);
  const status = open === 0 && ready > 0 ? "ready" : open ? "missing" : "unknown";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <SourceLabel>{live.kind}</SourceLabel>
          <h1 className="mt-2 font-[family-name:var(--font-space)] text-[33px] font-medium tracking-[-0.02em]">
            {live.name}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusPill tone={status === "ready" ? "signal" : "attention"}>{status}</StatusPill>
            {live.source ? <Mono className="text-[12px] text-[#101A15]/55">{live.source}</Mono> : null}
          </div>
        </div>
        <SourceButton href={live.blockers.length ? "/app/missing" : "/app/import"}>
          {live.blockers.length ? `Resolve ${live.blockers.length} open items` : "Upload more data"}
        </SourceButton>
      </div>

      {live.blockers.length ? (
        <section className="mt-8 border border-[#101A15]/10 bg-[#FBFCFA] p-5">
          <SourceLabel>What still needs information</SourceLabel>
          <ul className="mt-3 space-y-2">
            {live.blockers.map((blocker) => (
              <li key={blocker.caseId} className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
                <span>
                  {blocker.property}
                  <span className="text-[#101A15]/55"> · {blocker.actorLabel}</span>
                </span>
                <Link href={`/app/missing/${blocker.caseId}`} className="text-[#101A15]/70 hover:underline">
                  {(blocker.reason ?? blocker.state).replaceAll("_", " ")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="mt-8 text-[13px] text-[#101A15]/65">
          {ready ? "SOURCE has what it currently needs for this product." : "No missing-information cases yet. Upload a catalogue to start analysis."}
        </p>
      )}

      <div className="mt-10 flex gap-4 border-b border-[#101A15]/10">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`pb-2 text-[13px] ${tab === item ? "border-b-2 border-[#0B6E50] text-[#101A15]" : "text-[#101A15]/55"}`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <dl className="mt-6 grid gap-4 sm:grid-cols-4">
          {Object.entries(live.buckets ?? {}).map(([key, value]) => (
            <div key={key} className="border border-[#101A15]/10 bg-[#FBFCFA] px-4 py-3">
              <SourceLabel>{key.replaceAll("_", " ")}</SourceLabel>
              <div className="mt-1 font-[family-name:var(--font-plex)] text-[22px]">{value}</div>
            </div>
          ))}
        </dl>
      ) : null}

      {tab === "Components" ? (
        live.children.length ? (
          <ul className="mt-6 divide-y divide-[#101A15]/8 border border-[#101A15]/10 bg-[#FBFCFA]">
            {live.children.map((child) => (
              <li key={child.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
                <span>{child.name}</span>
                <SourceLabel>{child.kind ?? "component"}</SourceLabel>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-[13px] text-[#101A15]/55">No components recorded for this product yet.</p>
        )
      ) : null}

      {tab === "Requirements" ? (
        live.requirements?.length ? (
          <ul className="mt-6 space-y-2">
            {live.requirements.map((requirement) => (
              <li key={requirement.id} className="border border-[#101A15]/10 bg-[#FBFCFA] px-4 py-3 text-[13px]">
                <div>{requirement.propertyLabel}</div>
                <SourceLabel className="mt-1 block">{requirement.state?.replaceAll("_", " ") ?? "open"}</SourceLabel>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-[13px] text-[#101A15]/55">No requirements generated yet.</p>
        )
      ) : null}
    </div>
  );
}
