import Link from "next/link";
import { DEMO_SUPPLIERS } from "@/lib/source/demo-data";
import { PageHeader } from "@/components/source/page-header";
import { SourceButton, SourceTable, StatusPill } from "@/components/source/ui";

export default function SuppliersPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Suppliers"
        description="Operational core. SOURCE bundles collection — not 318 individual emails."
        actions={<SourceButton href="/app/requests/new">Start collection</SourceButton>}
      />
      <SourceTable columns={["Supplier", "Products", "Missing", "Evidence", "Requests", "Status"]}>
        {DEMO_SUPPLIERS.map((s) => (
          <tr key={s.id} className="border-t border-ink/8 hover:bg-paper/80">
            <td className="px-4 py-3">
              <Link href={`/app/suppliers/${s.id}`} className="hover:underline">
                {s.name}
              </Link>
            </td>
            <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{s.products}</td>
            <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{s.missing}</td>
            <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{s.evidence}%</td>
            <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{s.requests}</td>
            <td className="px-4 py-3">
              <StatusPill tone={s.status === "attention" ? "attention" : "signal"}>{s.status}</StatusPill>
            </td>
          </tr>
        ))}
      </SourceTable>
    </div>
  );
}
