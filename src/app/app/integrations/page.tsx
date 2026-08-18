"use client";

import { PageHeader } from "@/components/source/page-header";
import { EmptyState, SourceButton, SourceLabel } from "@/components/source/ui";
import { useSourceQuery } from "@/client/source/api";

export default function IntegrationsPage() {
  const { data } = useSourceQuery<{ jobs: { id: string; state: string; sourceFiles?: { products?: { filename: string } } }[] }>(
    "/api/imports"
  );
  const jobs = data?.jobs ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Integrations"
        description="Pilot intake is CSV upload. Native ERP connectors are out of scope until the supplier loop is proven."
      />
      {jobs.length === 0 ? (
        <EmptyState
          title="No catalogue connected yet"
          description="Upload products, suppliers, BOM and materials as CSV. SOURCE stores the original files privately."
          action={<SourceButton href="/app/import">Upload CSV</SourceButton>}
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <article key={job.id} className="border border-[#101A15]/10 bg-[#FBFCFA] p-5">
              <h2 className="font-[family-name:var(--font-space)] text-[20px]">{job.sourceFiles?.products?.filename ?? "Catalogue import"}</h2>
              <p className="mt-2 text-[13px] text-[#101A15]/65">{job.state.replaceAll("_", " ").toLowerCase()}</p>
            </article>
          ))}
          <SourceButton href="/app/import">Upload another file</SourceButton>
        </div>
      )}
      <p className="mt-6">
        <SourceLabel>CSV is the pilot connector. SAP and other ERPs are not connected.</SourceLabel>
      </p>
    </div>
  );
}
