"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/source/page-header";
import { EmptyState, SourceButton, SourceLabel, SourceTable, StatusPill } from "@/components/source/ui";
import { useSourceQuery } from "@/client/source/api";

interface ProductRow {
  id: string;
  name: string;
  kind: string;
  supplierLabel: string;
  identity: string;
  readyCount: number;
  openCount: number;
  status: string;
}

function statusTone(status: string) {
  if (status === "ready") return "signal" as const;
  if (status === "missing") return "attention" as const;
  return "muted" as const;
}

export default function ProductsPage() {
  const [q, setQ] = useState("");
  const [ready, setReady] = useState<"all" | "ready" | "not">("all");
  const { data, loading } = useSourceQuery<{ products: ProductRow[] }>("/api/source/products");
  const rows = useMemo(() => {
    return (data?.products ?? []).filter((p) => {
      const hay = `${p.name} ${p.id} ${p.supplierLabel}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (ready === "ready" && p.status !== "ready") return false;
      if (ready === "not" && p.status === "ready") return false;
      return true;
    });
  }, [data?.products, q, ready]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Products"
        description="Imported products in this workspace. SOURCE shows what is ready and what is still missing."
        actions={<SourceButton href="/app/import">Upload catalogue</SourceButton>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search product…"
          className="h-9 min-w-[240px] flex-1 rounded-sm border border-[#101A15]/15 bg-[#FBFCFA] px-3 text-[13px] outline-none"
        />
        {(["all", "ready", "not"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setReady(id)}
            className={`rounded-sm px-3 py-1.5 text-[12px] ${ready === id ? "bg-[#101A15] text-[#FBFCFA]" : "bg-[#FBFCFA] text-[#101A15]/70"}`}
          >
            {id === "all" ? "All" : id === "ready" ? "Ready" : "Not ready"}
          </button>
        ))}
      </div>
      {!loading && (data?.products.length ?? 0) === 0 ? (
        <EmptyState
          title="No products imported yet"
          description="Upload your first catalogue. SOURCE stores the original file, then finds missing DPP information."
          action={<SourceButton href="/app/import">Upload your first catalog</SourceButton>}
        />
      ) : (
        <>
          <SourceTable columns={["Product", "Supplier", "Identity", "Ready", "Open", "Status"]}>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-[#101A15]/8 hover:bg-[#EFF2ED]/80">
                <td className="px-4 py-3">
                  <Link href={`/app/products/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{p.supplierLabel}</td>
                <td className="px-4 py-3">
                  <StatusPill tone={p.identity === "matched" ? "signal" : "attention"}>{p.identity}</StatusPill>
                </td>
                <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{p.readyCount}</td>
                <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{p.openCount}</td>
                <td className="px-4 py-3">
                  <StatusPill tone={statusTone(p.status)}>{p.status}</StatusPill>
                </td>
              </tr>
            ))}
          </SourceTable>
          <p className="mt-3">
            <SourceLabel>
              {loading ? "Loading…" : `${rows.length} products in this view`}
            </SourceLabel>
          </p>
        </>
      )}
    </div>
  );
}
