"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DEMO_PRODUCTS } from "@/lib/source/demo-data";
import { PageHeader } from "@/components/source/page-header";
import { SourceButton, SourceLabel, SourceTable, StatusPill } from "@/components/source/ui";

function statusTone(status: string) {
  if (status === "ready") return "signal" as const;
  if (status === "missing") return "attention" as const;
  if (status === "authorization") return "teal" as const;
  return "muted" as const;
}

export default function ProductsPage() {
  const [q, setQ] = useState("");
  const [ready, setReady] = useState<"all" | "ready" | "not">("all");
  const rows = useMemo(
    () =>
      DEMO_PRODUCTS.filter((p) => {
        const hay = `${p.name} ${p.sku} ${p.gtin ?? ""} ${p.supplier}`.toLowerCase();
        if (q && !hay.includes(q.toLowerCase())) return false;
        if (ready === "ready" && p.status !== "ready") return false;
        if (ready === "not" && p.status === "ready") return false;
        return true;
      }),
    [q, ready]
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Products"
        description="A powerful table, not one-by-one product admin. Search, filter, then request missing data in bulk."
        actions={<SourceButton href="/app/requests/new">Request missing data</SourceButton>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search product, SKU, GTIN…"
          className="h-9 min-w-[240px] flex-1 border border-ink/15 bg-card px-3 text-[13px] outline-none"
        />
        {(["all", "ready", "not"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setReady(id)}
            className={`px-3 py-1.5 text-[12px] ${ready === id ? "bg-ink text-card" : "bg-card text-ink/70"}`}
          >
            {id === "all" ? "All" : id === "ready" ? "Ready" : "Not ready"}
          </button>
        ))}
      </div>
      <SourceTable columns={["Product", "SKU", "Supplier", "Identity", "Evidence", "Status"]}>
        {rows.map((p) => (
          <tr key={p.id} className="border-t border-ink/8 hover:bg-paper/80">
            <td className="px-4 py-3">
              <Link href={`/app/products/${p.id}`} className="hover:underline">
                {p.name}
              </Link>
            </td>
            <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{p.sku}</td>
            <td className="px-4 py-3">{p.supplier}</td>
            <td className="px-4 py-3">
              <StatusPill tone={p.identity === "matched" ? "signal" : "attention"}>
                {p.identity}
              </StatusPill>
            </td>
            <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{p.evidence}%</td>
            <td className="px-4 py-3">
              <StatusPill tone={statusTone(p.status)}>{p.status}</StatusPill>
            </td>
          </tr>
        ))}
      </SourceTable>
      <p className="mt-3">
        <SourceLabel>{rows.length} products in this view · demo catalogue 8,421</SourceLabel>
      </p>
    </div>
  );
}
