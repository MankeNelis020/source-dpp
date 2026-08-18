"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState, SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";
import { CaseStatePill, formatWhen } from "@/components/source/case-status";
import { useDispatchCommand, useSourceQuery } from "@/client/source/api";

export default function RequestDetailPage() {
  const params = useParams<{ id: string }>();
  const dispatch = useDispatchCommand();
  const { data: request, error, loading } = useSourceQuery<{
    id: string;
    caseId: string;
    supplierLabel: string;
    status: string;
    sentAt?: string;
    dueAt: string;
    complete: number;
    total: number;
    delivery?: { label: string; status: string; nextReminderAt?: string };
    cases: { id: string; state: string; nextAction: string; nextActionAt?: string; ownerLabel?: string }[];
  }>(params.id ? `/api/source/requests/${params.id}` : null);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState title="Request unavailable" description={error} action={<SourceButton href="/app/requests">Back to requests</SourceButton>} />
      </div>
    );
  }
  if (!request) return <p className="text-[13px] text-[#101A15]/55">{loading ? "Loading request…" : "Request unavailable."}</p>;

  const pct = request.total ? Math.round((request.complete / request.total) * 100) : 0;
  const focus = request.cases.find((c) => c.id === request.caseId) ?? request.cases[0];

  return (
    <div className="mx-auto max-w-3xl">
      <SourceLabel>Supplier request</SourceLabel>
      <h1 className="mt-2 font-[family-name:var(--font-space)] text-[33px] font-medium tracking-[-0.02em]">
        {request.supplierLabel}
      </h1>
      <p className="mt-2 text-[13px] text-[#101A15]/65">
        {request.sentAt ? `Sent ${formatWhen(request.sentAt)}` : "Queued"} · Due {formatWhen(request.dueAt)}
      </p>
      <div className="mt-3">
        <StatusPill tone={request.delivery?.status === "BOUNCED" ? "attention" : "teal"}>
          {request.delivery?.label ?? request.status.replaceAll("_", " ")}
        </StatusPill>
      </div>
      <div className="mt-8">
        <SourceLabel>Progress</SourceLabel>
        <div className="mt-2 font-[family-name:var(--font-plex)] text-[22px]">
          {request.complete} / {request.total} ready
        </div>
        <div className="mt-3 h-1.5 bg-[#101A15]/8">
          <div className="h-full bg-[#0B6E50]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {focus ? (
        <section className="mt-10 border border-[#101A15]/10 bg-[#FBFCFA] p-5">
          <SourceLabel>What happens next</SourceLabel>
          <p className="mt-2 text-[14.5px] leading-relaxed">
            {request.delivery?.status === "BOUNCED"
              ? "The email could not be delivered. Add another contact — this is not a missing supplier response."
              : focus.nextAction}
          </p>
          {focus.nextActionAt && request.delivery?.status !== "BOUNCED" ? (
            <p className="mt-2 font-[family-name:var(--font-plex)] text-[12px] text-[#101A15]/55">
              Next reminder {formatWhen(focus.nextActionAt)}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <SourceButton onClick={() => void dispatch({ type: "SEND_REMINDER", caseId: focus.id })}>
              Send reminder now
            </SourceButton>
            <SourceButton href={`/app/missing/${focus.id}`} variant="ghost">
              Open missing-information item
            </SourceButton>
          </div>
        </section>
      ) : null}

      {request.cases.length ? (
        <section className="mt-10">
          <h2 className="font-[family-name:var(--font-space)] text-[20px]">Related items</h2>
          <ul className="mt-3 space-y-2">
            {request.cases.map((c) => (
              <li key={c.id}>
                <Link href={`/app/missing/${c.id}`} className="flex items-center justify-between text-[13px] hover:underline">
                  <span>{c.nextAction}</span>
                  <CaseStatePill state={c.state as import("@/domain/source").ResolutionCaseState} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
