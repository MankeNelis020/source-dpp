"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { supplierById } from "@/lib/source/demo-data";
import { Metric, SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";
import { CaseStatePill } from "@/components/source/case-status";
import { useSourceQuery } from "@/client/source/api";

const SUPPLIER_HEALTH_COPY: Record<string, { overdue: number; forwardedUpstream: number; confidential: number; awaitingEvidence: number; conflict: number }> = {
  "supplier-a": { overdue: 2, forwardedUpstream: 7, confidential: 3, awaitingEvidence: 4, conflict: 1 },
};

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const supplier = supplierById(params.id);
  const { data } = useSourceQuery<{ cases: { id: string; propertyLabel: string; actorLabel: string; nextAction: string; state: import("@/domain/source").ResolutionCaseState; supplierId?: string }[] }>("/api/source/cases?filter=all");
  if (!supplier) notFound();
  const computed = { overdue: 0, forwardedUpstream: 0, confidential: 0, awaitingEvidence: 0, conflict: 0 };
  const health = SUPPLIER_HEALTH_COPY[supplier.id] ?? computed;
  const cases = (data?.cases ?? []).filter((c) => c.supplierId === supplier.id);

  return (
    <div className="mx-auto max-w-5xl">
      <SourceLabel>Supplier</SourceLabel>
      <h1 className="mt-2 font-[family-name:var(--font-space)] text-[33px] font-medium tracking-[-0.02em]">
        {supplier.name}
      </h1>
      <p className="mt-2 text-[13px] text-[#101A15]/65">
        Matched to {supplier.legalName} · Identity confidence {supplier.identityConfidence}%
      </p>
      <div className="mt-3">
        <StatusPill tone={supplier.status === "attention" ? "attention" : "signal"}>
          {supplier.status}
        </StatusPill>
      </div>
      <div className="mt-10 grid gap-8 sm:grid-cols-4">
        <Metric value={String(supplier.products)} label="Products supplied" />
        <Metric value={`${supplier.evidence}%`} label="Evidence coverage" />
        <Metric value={String(supplier.missing)} label="Missing claims" />
        <Metric value="6" label="Evidence items expiring" />
      </div>

      <section className="mt-10 border border-[#101A15]/10 bg-[#FBFCFA] p-5">
        <SourceLabel>Response health</SourceLabel>
        <p className="mt-2 text-[13px] text-[#101A15]/65">
          Completeness does not explain why collection is stuck. This does.
        </p>
        <div className="mt-5 grid gap-6 sm:grid-cols-5">
          <Health n={health.overdue} label="Overdue" />
          <Health n={health.forwardedUpstream} label="Forwarded upstream" />
          <Health n={health.confidential} label="Confidential" />
          <Health n={health.awaitingEvidence} label="Awaiting evidence" />
          <Health n={health.conflict} label="Conflict" />
        </div>
      </section>

      {cases.length ? (
        <section className="mt-10">
          <h2 className="font-[family-name:var(--font-space)] text-[20px]">Open resolution cases</h2>
          <ul className="mt-3 divide-y divide-[#101A15]/8 border border-[#101A15]/10 bg-[#FBFCFA]">
            {cases.map((c) => {
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <Link href={`/app/missing/${c.id}`} className="text-[13px] hover:underline">
                      {c.id} · {c.propertyLabel}
                    </Link>
                    <p className="text-[12px] text-[#101A15]/55">
                      {c.actorLabel} · {c.nextAction}
                    </p>
                  </div>
                  <CaseStatePill state={c.state} />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p className="mt-8 max-w-xl text-[13px] text-[#101A15]/70">
        {supplier.name} has {supplier.missing} missing claims across 18 product families. SOURCE
        will request the gaps in one collection — not {supplier.products} individual mails.
      </p>
      <div className="mt-8 flex flex-wrap gap-2">
        <SourceButton href="/app/requests/new">Request missing information</SourceButton>
        <SourceButton href="/app/missing" variant="ghost">
          View resolution cases
        </SourceButton>
      </div>
    </div>
  );
}

function Health({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="font-[family-name:var(--font-plex)] text-[22px]">{n}</div>
      <SourceLabel className="mt-1 block">{label}</SourceLabel>
    </div>
  );
}
