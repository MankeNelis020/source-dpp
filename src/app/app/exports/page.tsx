"use client";

import { PageHeader } from "@/components/source/page-header";
import { EmptyState, SourceButton, SourceLabel } from "@/components/source/ui";
import { useSourceQuery } from "@/client/source/api";

export default function ExportsPage() {
  const { data } = useSourceQuery<{ liveCounts: { products: number; requirements: number } }>("/api/source/workspace");
  const empty = data && data.liveCounts.products === 0 && data.liveCounts.requirements === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Exports"
        description="You can leave SOURCE. Open formats are the goal. Pilot export of live workspace data is available from the pages that already show persisted records."
      />
      {empty ? (
        <EmptyState
          title="Nothing to export yet"
          description="Upload a catalogue first. SOURCE will not invent an export from demo data."
          action={<SourceButton href="/app/import">Upload catalogue</SourceButton>}
        />
      ) : (
        <>
          <ul className="space-y-2 text-[13px]">
            {["Products", "Suppliers", "Missing information", "Evidence", "Results"].map((item) => (
              <li key={item} className="border-b border-[#101A15]/8 py-3">
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-6">
            <SourceLabel>Use the workspace tables for the current pilot export. A packaged JSON/CSV dump is not enabled yet.</SourceLabel>
          </p>
        </>
      )}
    </div>
  );
}
