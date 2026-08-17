"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/source/page-header";
import { Metric, SourceLabel, SourceTable } from "@/components/source/ui";
import { CaseStatePill, formatWhen } from "@/components/source/case-status";
import { CASE_FILTERS, actorLabelForViewer, matchesFilter } from "@/domain/source/queries";
import { useEngineState } from "@/domain/source/store";
import type { CaseFilter } from "@/domain/source";

export default function MissingInformationPage() {
  const state = useEngineState();
  const [filter, setFilter] = useState<CaseFilter>("all");
  const rows = useMemo(
    () => state.cases.filter((c) => matchesFilter(c, filter)),
    [state.cases, filter]
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Missing information"
        description="SOURCE does not stop at request sent. Each row is a resolution case: what is missing, why, who owns it, and what happens next."
      />

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
        <Metric value={String(state.cases.filter((c) => c.state !== "READY" && c.state !== "MONITORING" && c.state !== "RETURNED").length)} label="Open cases in this demo" />
        <Metric value={String(state.cases.filter((c) => c.state === "WAITING_RESPONSE").length)} label="Waiting supplier" />
        <Metric value={String(state.cases.filter((c) => c.state === "WAITING_UPSTREAM").length)} label="Waiting upstream" />
        <Metric value={String(state.cases.filter((c) => c.state === "UNRESOLVED").length)} label="Unresolved" />
      </div>

      <SourceTable columns={["Case", "Need", "Actor", "Why it is stuck", "Next action", "When", "State"]}>
        {rows.map((c) => {
          const requirement = state.requirements.find((r) => r.id === c.requirementId);
          return (
            <tr key={c.id} className="border-t border-[#101A15]/8 hover:bg-[#EFF2ED]/80">
              <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">
                <Link href={`/app/missing/${c.id}`} className="hover:underline">
                  {c.id}
                </Link>
              </td>
              <td className="px-4 py-3">
                <div>{requirement?.propertyLabel}</div>
                <SourceLabel className="mt-0.5 block">{requirement?.subjectLabel}</SourceLabel>
              </td>
              <td className="px-4 py-3 text-[13px]">{actorLabelForViewer(state, c.currentActorId, true)}</td>
              <td className="px-4 py-3 text-[13px] text-[#101A15]/75">
                {c.blockingReason ? c.blockingReason.replaceAll("_", " ") : "—"}
              </td>
              <td className="px-4 py-3 text-[13px]">{c.nextAction}</td>
              <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">
                {formatWhen(c.nextActionAt)}
              </td>
              <td className="px-4 py-3">
                <CaseStatePill state={c.state} />
              </td>
            </tr>
          );
        })}
      </SourceTable>
      <p className="mt-3">
        <SourceLabel>
          {rows.length} cases in this view. A request can be declined while the case continues on another route.
        </SourceLabel>
      </p>
    </div>
  );
}
