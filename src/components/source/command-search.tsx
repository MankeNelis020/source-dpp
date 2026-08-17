"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_PRODUCTS, DEMO_SUPPLIERS, DEMO_REQUESTS, DEMO_EVIDENCE } from "@/lib/source/demo-data";
import { SourceLabel } from "./ui";

export function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const items: { type: string; label: string; href: string }[] = [
      ...DEMO_PRODUCTS.map((p) => ({
        type: "Product",
        label: `${p.name} · ${p.sku}`,
        href: `/app/products/${p.id}`,
      })),
      ...DEMO_SUPPLIERS.map((s) => ({
        type: "Supplier",
        label: `${s.name} · ${s.vat ?? ""}`,
        href: `/app/suppliers/${s.id}`,
      })),
      ...DEMO_REQUESTS.map((r) => ({
        type: "Request",
        label: r.supplierName,
        href: `/app/requests/${r.id}`,
      })),
      ...DEMO_EVIDENCE.map((e) => ({
        type: "Evidence",
        label: e.filename,
        href: `/app/evidence/${e.id}`,
      })),
    ];
    if (!query) return items.slice(0, 8);
    return items.filter((i) => i.label.toLowerCase().includes(query)).slice(0, 10);
  }, [q]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full max-w-xs items-center justify-between border border-ink/10 bg-card px-3 text-left text-[12px] text-ink/45"
      >
        <span>Search product, SKU, VAT…</span>
        <span className="font-[family-name:var(--font-plex)] text-[10px]">⌘K</span>
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/25 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg border border-ink/10 bg-card shadow-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Product, SKU, GTIN, supplier, VAT, evidence…"
              className="w-full border-b border-ink/10 bg-transparent px-4 py-3 text-[14px] outline-none"
            />
            <ul className="max-h-80 overflow-y-auto py-2">
              {results.map((item) => (
                <li key={item.href + item.label}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-2 text-left text-[13px] hover:bg-paper"
                    onClick={() => {
                      setOpen(false);
                      router.push(item.href);
                    }}
                  >
                    <span>{item.label}</span>
                    <SourceLabel>{item.type}</SourceLabel>
                  </button>
                </li>
              ))}
              {results.length === 0 ? (
                <li className="px-4 py-6 text-[13px] text-ink/50">No matches.</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
