"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/source/page-header";
import { Metric, SourceLabel, SourceTable } from "@/components/source/ui";
import { CaseStatePill, formatWhen } from "@/components/source/case-status";
import { CASE_FILTERS } from "@/domain/source/queries";
import { useSourceQuery } from "@/client/source/api";
import type { CaseFilter, ResolutionCaseState } from "@/domain/source";

interface CaseRow {
  id: string;
  propertyLabel: string;
  subjectLabel: string;
  actorLabel: string;
  blockingReason?: string;
  nextAction: string;
  nextActionAt?: string;
  state: ResolutionCaseState;
}

export default function MissingInformationPage() {
  const [filter, setFilter] = useState<CaseFilter>("all");
  const { data, loading } = useSourceQuery<{ cases: CaseRow[] }>(`/api/source/cases?filter=${filter}`);
  const { data: board } = useSourceQuery<{
    columns: Record<string, number>;
    activity: { id: string; timestamp: string; detail: string }[];
  }>("/api/source/workboard");
  const rows = data?.cases ?? [];
  const open = useMemo(() => rows.length, [rows.length]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Missing information"
        description="SOURCE does not stop at request sent. Each row is a resolution case: what is missing, why, who owns it, and what happens next."
      />

      {board ? (
        <div className="mb-8 grid gap-3 sm:grid-cols-5">
          {Object.entries(board.columns).map(([key, value]) => (
            <div key={key} className="border border-[#101A15]/10 bg-[#FBFCFA] px-4 py-3">
              <SourceLabel>{key.replaceAll("_", " ")}</SourceLabel>
              <div className="mt-1 font-[family-name:var(--font-plex)] text-[22px]">{value}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-1.5">
        {CASE_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-sm px-3 py-1.5 text-[12px] ${
              filter === item.id ? "bg-[#101A15] text-[#FBFCFA]" : "bg-[#FBFCFA] text-[#101A15]/70"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mb-8 grid gap-6 sm:grid-cols-4">
        <Metric value={loading ? "…" : String(open)} label="Cases in this view" />
        <Metric value={String(rows.filter((c) => c.state === "WAITING_RESPONSE").length)} label="Waiting supplier" />
        <Metric value={String(rows.filter((c) => c.state === "WAITING_UPSTREAM").length)} label="Waiting upstream" />
        <Metric value={String(rows.filter((c) => c.state === "UNRESOLVED").length)} label="Unresolved" />
      </div>

      <SourceTable columns={["Case", "Need", "Actor", "Why it is stuck", "Next action", "When", "State"]}>
        {rows.map((c) => (
          <tr key={c.id} className="border-t border-[#101A15]/8 hover:bg-[#EFF2ED]/80">
            <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">
              <Link href={`/app/missing/${c.id}`} className="hover:underline">
                {c.id}
              </Link>
            </td>
            <td className="px-4 py-3">
              <div>{c.propertyLabel}</div>
              <SourceLabel className="mt-0.5 block">{c.subjectLabel}</SourceLabel>
            </td>
            <td className="px-4 py-3 text-[13px]">{c.actorLabel}</td>
            <td className="px-4 py-3 text-[13px] text-[#101A15]/75">
              {c.blockingReason ? c.blockingReason.replaceAll("_", " ") : "—"}
            </td>
            <td className="px-4 py-3 text-[13px]">{c.nextAction}</td>
            <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{formatWhen(c.nextActionAt)}</td>
            <td className="px-4 py-3">
              <CaseStatePill state={c.state} />
            </td>
          </tr>
        ))}
      </SourceTable>
      {board?.activity?.length ? (
        <section className="mt-10">
          <h2 className="font-[family-name:var(--font-space)] text-[20px]">Live activity</h2>
          <ol className="mt-3 space-y-2">
            {board.activity.slice(0, 8).map((event) => (
              <li key={event.id} className="flex gap-4 text-[13px]">
                <span className="w-40 shrink-0 font-[family-name:var(--font-plex)] text-[12px] text-[#101A15]/50">
                  {formatWhen(event.timestamp)}
                </span>
                <span>{event.detail}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
