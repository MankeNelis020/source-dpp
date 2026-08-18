"use client";

import Link from "next/link";
import { PageHeader } from "@/components/source/page-header";
import { EmptyState, SourceButton, SourceTable, StatusPill } from "@/components/source/ui";
import { formatWhen } from "@/components/source/case-status";
import { useSourceQuery } from "@/client/source/api";

interface RequestRow {
  id: string;
  caseId: string;
  supplierLabel: string;
  status: string;
  sentAt?: string;
  dueAt: string;
  complete: number;
  total: number;
}

function tone(status: string) {
  if (status === "COMPLETED" || status === "SUBMITTED") return "signal" as const;
  if (status === "BOUNCED" || status === "UNDELIVERABLE" || status === "NO_RESPONSE") return "attention" as const;
  return "muted" as const;
}

export default function RequestsPage() {
  const { data, loading } = useSourceQuery<{ requests: RequestRow[] }>("/api/source/requests");
  const rows = data?.requests ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Supplier requests"
        description="A request is one attempt to close a gap. SOURCE does not invent contacts or send mail until you ask it to handle the gaps."
        actions={
          <div className="flex gap-2">
            <SourceButton href="/app/missing" variant="ghost">
              Missing information
            </SourceButton>
            <SourceButton href="/app/import">Upload catalogue</SourceButton>
          </div>
        }
      />
      {!loading && rows.length === 0 ? (
        <EmptyState
          title="No supplier requests yet"
          description="SOURCE hasn't needed to contact a supplier yet. Import a catalogue and let SOURCE handle the remaining gaps."
          action={<SourceButton href="/app/import">Upload your first catalog</SourceButton>}
        />
      ) : (
        <SourceTable columns={["Supplier", "Progress", "Sent", "Due", "Status"]}>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-[#101A15]/8 hover:bg-[#EFF2ED]/80">
              <td className="px-4 py-3">
                <Link href={`/app/requests/${r.id}`} className="hover:underline">
                  {r.supplierLabel}
                </Link>
              </td>
              <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">
                {r.complete} / {r.total}
              </td>
              <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{formatWhen(r.sentAt)}</td>
              <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{formatWhen(r.dueAt)}</td>
              <td className="px-4 py-3">
                <StatusPill tone={tone(r.status)}>{r.status.replaceAll("_", " ")}</StatusPill>
              </td>
            </tr>
          ))}
        </SourceTable>
      )}
    </div>
  );
}
