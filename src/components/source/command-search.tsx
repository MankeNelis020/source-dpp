"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SourceLabel } from "./ui";
import { api } from "@/client/source/api";

interface SearchResult {
  actors: { id: string; name: string; kind: string }[];
  subjects: { id: string; name: string; kind: string }[];
  evidence: { opaqueRef: string; filename: string }[];
}

export function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);

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

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => {
      void api<SearchResult>(`/api/source/search?q=${encodeURIComponent(q)}`)
        .then(setResult)
        .catch(() => setResult({ actors: [], subjects: [], evidence: [] }));
    }, 120);
    return () => window.clearTimeout(handle);
  }, [open, q]);

  const items = useMemo(() => {
    const rows: { type: string; label: string; href: string }[] = [
      { type: "Page", label: "Upload catalogue", href: "/app/import" },
      { type: "Page", label: "Missing information", href: "/app/missing" },
      { type: "Page", label: "Needs you", href: "/app/reviews" },
      { type: "Page", label: "Results", href: "/app/pilot" },
      ...(result?.subjects ?? []).map((s) => ({
        type: s.kind === "PRODUCT" || s.kind === "VARIANT" ? "Product" : "Subject",
        label: s.name,
        href: `/app/products/${s.id}`,
      })),
      ...(result?.actors ?? []).map((a) => ({
        type: "Supplier",
        label: a.name,
        href: `/app/suppliers/${a.id}`,
      })),
      ...(result?.evidence ?? []).map((e) => ({
        type: "Evidence",
        label: e.filename,
        href: `/app/evidence/${e.opaqueRef}`,
      })),
    ];
    const query = q.trim().toLowerCase();
    if (!query) return rows.slice(0, 8);
    return rows.filter((item) => item.label.toLowerCase().includes(query)).slice(0, 10);
  }, [q, result]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full max-w-xs items-center justify-between rounded-sm border border-[#101A15]/10 bg-[#FBFCFA] px-3 text-left text-[12px] text-[#101A15]/45"
      >
        <span>Search product, supplier, evidence…</span>
        <span className="font-[family-name:var(--font-plex)] text-[10px]">⌘K</span>
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[#101A15]/25 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg border border-[#101A15]/10 bg-[#FBFCFA] shadow-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Product, supplier, evidence…"
              className="w-full border-b border-[#101A15]/10 bg-transparent px-4 py-3 text-[14px] outline-none"
            />
            <ul className="max-h-80 overflow-y-auto py-2">
              {items.map((item) => (
                <li key={item.href + item.label}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-2 text-left text-[13px] hover:bg-[#EFF2ED]"
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
              {items.length === 0 ? (
                <li className="px-4 py-6 text-[13px] text-[#101A15]/50">No matches in this workspace.</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
