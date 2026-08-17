import Link from "next/link";
import { DEMO_REQUESTS } from "@/lib/source/demo-data";
import { PageHeader } from "@/components/source/page-header";
import { SourceButton, SourceTable, StatusPill } from "@/components/source/ui";

function tone(status: string) {
  if (status === "complete") return "signal" as const;
  if (status === "overdue") return "attention" as const;
  if (status === "review_required") return "teal" as const;
  return "muted" as const;
}

export default function RequestsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Requests"
        description="A request is one attempt to resolve missing information. The case continues if the mail bounces, the contact is wrong, or the supplier asks upstream."
        actions={
          <div className="flex gap-2">
            <SourceButton href="/app/missing" variant="ghost">
              Resolution cases
            </SourceButton>
            <SourceButton href="/app/requests/new">New request</SourceButton>
          </div>
        }
      />
      <SourceTable columns={["Supplier", "Claims", "Sent", "Last activity", "Due", "Status"]}>
        {DEMO_REQUESTS.map((r) => (
          <tr key={r.id} className="border-t border-[#101A15]/8 hover:bg-[#EFF2ED]/80">
            <td className="px-4 py-3">
              <Link href={`/app/requests/${r.id}`} className="hover:underline">
                {r.supplierName}
              </Link>
            </td>
            <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">
              {r.complete} / {r.claimsRequested}
            </td>
            <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{r.sent}</td>
            <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{r.lastActivity}</td>
            <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{r.due}</td>
            <td className="px-4 py-3">
              <StatusPill tone={tone(r.status)}>{r.status.replace("_", " ")}</StatusPill>
            </td>
          </tr>
        ))}
      </SourceTable>
    </div>
  );
}
