"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { requestById } from "@/lib/source/demo-data";
import { SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";
import { CaseStatePill, formatWhen } from "@/components/source/case-status";
import { dispatchCommand, useEngineState } from "@/domain/source/store";

export default function RequestDetailPage() {
  const params = useParams<{ id: string }>();
  const request = requestById(params.id);
  const engine = useEngineState();
  if (!request) notFound();
  const pct = Math.round((request.complete / request.claimsRequested) * 100);
  const cases = engine.cases.filter((c) => c.supplierId === request.supplierId || c.requestId?.includes(request.supplierId));
  const focus = cases.find((c) => c.state === "WAITING_RESPONSE") ?? cases[0];

  return (
    <div className="mx-auto max-w-3xl">
      <SourceLabel>Request</SourceLabel>
      <h1 className="mt-2 font-[family-name:var(--font-space)] text-[33px] font-medium tracking-[-0.02em]">
        {request.supplierName}
      </h1>
      <p className="mt-2 text-[13px] text-[#101A15]/65">
        Requested {request.sent} · Due {request.due}
      </p>
      <div className="mt-3">
        <StatusPill tone={request.status === "overdue" ? "attention" : "teal"}>
          {request.status.replace("_", " ")}
        </StatusPill>
      </div>
      <div className="mt-8">
        <SourceLabel>Progress</SourceLabel>
        <div className="mt-2 font-[family-name:var(--font-plex)] text-[22px]">
          {request.complete} / {request.claimsRequested} complete
        </div>
        <div className="mt-3 h-1.5 bg-[#101A15]/8">
          <div className="h-full bg-[#0B6E50]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {focus ? (
        <section className="mt-10 border border-[#101A15]/10 bg-[#FBFCFA] p-5">
          <SourceLabel>What happens next</SourceLabel>
          <p className="mt-2 text-[14.5px] leading-relaxed">
            Waiting for {request.supplierName}. {focus.nextAction}
          </p>
          {focus.nextActionAt ? (
            <p className="mt-2 font-[family-name:var(--font-plex)] text-[12px] text-[#101A15]/55">
              Automatic next step {formatWhen(focus.nextActionAt)}
            </p>
          ) : null}
          <p className="mt-2 text-[13px] text-[#101A15]/65">
            Escalation owner: {focus.ownerLabel ?? "John — Procurement"}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <SourceButton onClick={() => dispatchCommand({ type: "SEND_REMINDER", caseId: focus.id })}>
              Send reminder now
            </SourceButton>
            <SourceButton variant="ghost" onClick={() => dispatchCommand({ type: "ESCALATE", caseId: focus.id })}>
              Escalate
            </SourceButton>
            <SourceButton href={`/app/missing/${focus.id}`} variant="ghost">
              Open resolution case
            </SourceButton>
          </div>
        </section>
      ) : null}

      <ol className="mt-10 space-y-3">
        {request.timeline.map((item) => (
          <li key={item.date + item.event} className="flex gap-4 text-[13px]">
            <span className="w-16 font-[family-name:var(--font-plex)] text-[12px] text-[#101A15]/50">
              {item.date}
            </span>
            <span>{item.event}</span>
          </li>
        ))}
      </ol>

      {cases.length ? (
        <section className="mt-10">
          <h2 className="font-[family-name:var(--font-space)] text-[20px]">Resolution cases on this request</h2>
          <p className="mt-1 text-[13px] text-[#101A15]/60">
            A request can be declined while the case continues on another route.
          </p>
          <ul className="mt-3 space-y-2">
            {cases.map((c) => (
              <li key={c.id}>
                <Link href={`/app/missing/${c.id}`} className="flex items-center justify-between text-[13px] hover:underline">
                  <span>{c.id}</span>
                  <CaseStatePill state={c.state} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-10 flex flex-wrap gap-2">
        <SourceButton variant="ghost" href="/s/demo">
          Open supplier view
        </SourceButton>
        <SourceButton href="/app/missing" variant="ghost">
          All missing information
        </SourceButton>
      </div>
    </div>
  );
}
