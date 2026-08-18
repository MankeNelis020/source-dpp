"use client";

import Link from "next/link";
import { PageHeader } from "@/components/source/page-header";
import { Metric, SourceButton, SourceLabel } from "@/components/source/ui";
import { formatWhen } from "@/components/source/case-status";
import { useSourceQuery } from "@/client/source/api";

export default function OverviewPage() {
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";
  const { data } = useSourceQuery<{
    organisation: { name: string };
    summary: {
      readyPercent: number;
      missing: number;
      sourceCanResolve: number;
      waitingOnSuppliers: number;
      needsYou: number;
      resolved: number;
    };
    liveCounts: { products: number; suppliers: number; relationships: number; requirements: number };
    activity: { id: string; timestamp: string; detail: string }[];
  }>("/api/source/workspace");
  const { data: board } = useSourceQuery<{
    columns: Record<string, number>;
    activity: { id: string; timestamp: string; detail: string }[];
    breakdown: { needsYou: Record<string, number>; sourceCanResolve: Record<string, number> };
  }>("/api/source/workboard");

  const summary = data?.summary;
  const empty =
    data &&
    data.liveCounts.products === 0 &&
    data.liveCounts.requirements === 0 &&
    data.liveCounts.suppliers === 0;

  if (empty) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <PageHeader
          title="Your workspace is ready."
          description="Upload the data you already have. SOURCE will work out what's missing."
        />
        <SourceButton href="/app/import">Import catalogue</SourceButton>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={hello}
        description="SOURCE understands your catalogue, knows what's missing, and is already resolving it."
      />

      <section className="border border-[#101A15]/10 bg-[#FBFCFA] p-6">
        <SourceLabel>This workspace</SourceLabel>
        <div className="mt-3 font-[family-name:var(--font-plex)] text-[40px] leading-none">{summary?.readyPercent ?? "—"}%</div>
        <p className="mt-2 text-[13px] text-[#101A15]/65">Ready among live resolution cases — not a decorative completeness score.</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          <SmallStat label="Missing" value={String(summary?.missing ?? "—")} />
          <SmallStat label="SOURCE can resolve" value={String(summary?.sourceCanResolve ?? "—")} />
          <SmallStat label="Waiting on suppliers" value={String(summary?.waitingOnSuppliers ?? "—")} />
          <SmallStat label="Needs you" value={String(summary?.needsYou ?? "—")} />
          <SmallStat label="Resolved" value={String(summary?.resolved ?? "—")} />
        </div>
      </section>

      {board ? (
        <section className="mt-8 grid gap-3 sm:grid-cols-6">
          {Object.entries(board.columns).map(([key, value]) => (
            <Link key={key} href="/app/missing" className="border border-[#101A15]/10 bg-[#FBFCFA] px-4 py-4">
              <SourceLabel>{key.replaceAll("_", " ")}</SourceLabel>
              <div className="mt-1 font-[family-name:var(--font-plex)] text-[26px]">{value}</div>
            </Link>
          ))}
        </section>
      ) : null}

      <div className="mt-8 grid gap-8 sm:grid-cols-4">
        <Metric value={String(data?.liveCounts.products ?? "—")} label="Products in live graph" />
        <Metric value={String(data?.liveCounts.suppliers ?? "—")} label="Visible suppliers" />
        <Metric value={String(data?.liveCounts.relationships ?? "—")} label="Relationships" />
        <Metric value={String(data?.liveCounts.requirements ?? "—")} label="Requirements" />
      </div>

      <h2 className="mt-12 font-[family-name:var(--font-space)] text-[20px] tracking-[-0.02em]">Live activity</h2>
      <ol className="mt-4 space-y-2">
        {(board?.activity ?? data?.activity ?? []).slice(0, 8).map((event) => (
          <li key={event.id} className="flex gap-4 text-[13px]">
            <span className="w-40 shrink-0 font-[family-name:var(--font-plex)] text-[12px] text-[#101A15]/50">
              {formatWhen(event.timestamp)}
            </span>
            <span>{event.detail}</span>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-wrap gap-2">
        <SourceButton href="/app/missing">Start resolving</SourceButton>
        <SourceButton href="/app/reviews" variant="ghost">
          Needs you
        </SourceButton>
        <SourceButton href="/app/import" variant="ghost">
          Analyse catalogue
        </SourceButton>
      </div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-[family-name:var(--font-plex)] text-[22px]">{value}</div>
      <div className="mt-1 text-[12px] text-[#101A15]/55">{label}</div>
    </div>
  );
}
