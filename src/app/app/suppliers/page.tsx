"use client";

import Link from "next/link";
import { PageHeader } from "@/components/source/page-header";
import { EmptyState, SourceButton, SourceTable, StatusPill } from "@/components/source/ui";
import { useSourceQuery } from "@/client/source/api";

interface SupplierRow {
  id: string;
  name: string;
  legalName: string;
  country?: string;
  productsSupplied: number;
  openRequirements: number;
  waiting: number;
  requests: number;
  contactsAvoided: number;
  status: string;
}

export default function SuppliersPage() {
  const { data, loading } = useSourceQuery<{ suppliers: SupplierRow[] }>("/api/source/suppliers");
  const rows = data?.suppliers ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Suppliers"
        description="SOURCE contacts a supplier only when existing evidence cannot close a gap."
        actions={<SourceButton href="/app/import">Upload catalogue</SourceButton>}
      />
      {!loading && rows.length === 0 ? (
        <EmptyState
          title="No suppliers identified yet"
          description="After SOURCE identifies suppliers from your catalogue, it lists the organisations it may need to contact."
          action={<SourceButton href="/app/import">Upload your first catalog</SourceButton>}
        />
      ) : (
        <SourceTable columns={["Supplier", "Products", "Open", "Waiting", "Requests", "Contacts avoided", "Status"]}>
          {rows.map((s) => (
            <tr key={s.id} className="border-t border-[#101A15]/8 hover:bg-[#EFF2ED]/80">
              <td className="px-4 py-3">
                <Link href={`/app/suppliers/${s.id}`} className="hover:underline">
                  {s.name}
                </Link>
              </td>
              <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{s.productsSupplied}</td>
              <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{s.openRequirements}</td>
              <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{s.waiting}</td>
              <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{s.requests}</td>
              <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{s.contactsAvoided}</td>
              <td className="px-4 py-3">
                <StatusPill tone={s.status === "attention" ? "attention" : "signal"}>{s.status}</StatusPill>
              </td>
            </tr>
          ))}
        </SourceTable>
      )}
    </div>
  );
}
