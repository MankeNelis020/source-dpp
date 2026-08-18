"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState, Metric, SourceButton, SourceLabel } from "@/components/source/ui";
import { CaseStatePill } from "@/components/source/case-status";
import { useSourceQuery } from "@/client/source/api";

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, error, loading } = useSourceQuery<{
    id: string;
    name: string;
    legalName: string;
    country?: string;
    productsSupplied: number;
    openRequirements: number;
    requestsAvoided: number;
    activeRequests: number;
    waitingUpstream: number;
  }>(params.id ? `/api/source/suppliers/${params.id}` : null);
  const { data: cases } = useSourceQuery<{
    cases: {
      id: string;
      propertyLabel: string;
      nextAction: string;
      state: import("@/domain/source").ResolutionCaseState;
      supplierId?: string;
    }[];
  }>("/api/source/cases?filter=all");

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState title="Supplier unavailable" description={error} action={<SourceButton href="/app/suppliers">Back to suppliers</SourceButton>} />
      </div>
    );
  }
  if (!data) return <p className="text-[13px] text-[#101A15]/55">{loading ? "Loading supplier…" : "Supplier unavailable."}</p>;

  const related = (cases?.cases ?? []).filter((c) => c.supplierId === data.id);

  return (
    <div className="mx-auto max-w-5xl">
      <SourceLabel>Supplier</SourceLabel>
      <h1 className="mt-2 font-[family-name:var(--font-space)] text-[33px] font-medium tracking-[-0.02em]">
        {data.name}
      </h1>
      <p className="mt-2 text-[13px] text-[#101A15]/65">
        {data.legalName}
        {data.country ? ` · ${data.country}` : ""}
      </p>
      <div className="mt-10 grid gap-8 sm:grid-cols-4">
        <Metric value={String(data.productsSupplied)} label="Products supplied" />
        <Metric value={String(data.openRequirements)} label="Open requirements" />
        <Metric value={String(data.requestsAvoided)} label="Contacts avoided" />
        <Metric value={String(data.activeRequests)} label="Active requests" />
      </div>

      <section className="mt-10 border border-[#101A15]/10 bg-[#FBFCFA] p-5">
        <SourceLabel>Why collection is waiting</SourceLabel>
        <div className="mt-5 grid gap-6 sm:grid-cols-3">
          <Health n={related.filter((c) => c.state === "WAITING_RESPONSE").length} label="Waiting for a reply" />
          <Health n={data.waitingUpstream} label="Waiting further upstream" />
          <Health n={related.filter((c) => c.state === "CONFLICT" || c.state === "IDENTITY_REVIEW").length} label="Needs you" />
        </div>
      </section>

      {related.length ? (
        <section className="mt-10">
          <h2 className="font-[family-name:var(--font-space)] text-[20px]">Open items</h2>
          <ul className="mt-3 divide-y divide-[#101A15]/8 border border-[#101A15]/10 bg-[#FBFCFA]">
            {related.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <Link href={`/app/missing/${c.id}`} className="text-[13px] hover:underline">
                    {c.propertyLabel}
                  </Link>
                  <p className="text-[12px] text-[#101A15]/55">{c.nextAction}</p>
                </div>
                <CaseStatePill state={c.state} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="mt-10 text-[13px] text-[#101A15]/65">SOURCE has not needed to contact this supplier yet.</p>
      )}

      <div className="mt-8 flex flex-wrap gap-2">
        <SourceButton href="/app/missing">View missing information</SourceButton>
        <SourceButton href="/app/import" variant="ghost">
          Upload more data
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
