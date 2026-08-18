"use client";

import { PageHeader } from "@/components/source/page-header";
import { EmptyState, SourceButton, StatusPill } from "@/components/source/ui";
import { useSourceQuery } from "@/client/source/api";

export default function GraphPage() {
  const { data } = useSourceQuery<{ products: { id: string; name: string; status: string; openCount: number }[] }>(
    "/api/source/products"
  );
  const products = data?.products ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Product structure"
        description="A compact view of imported products. Protected upstream identities stay hidden."
      />
      {products.length === 0 ? (
        <EmptyState
          title="No products imported yet"
          description="Upload a catalogue to see products and their open information gaps."
          action={<SourceButton href="/app/import">Upload catalogue</SourceButton>}
        />
      ) : (
        <div className="border border-[#101A15]/10 bg-[#FBFCFA] p-8 font-[family-name:var(--font-plex)] text-[13px] leading-8">
          {products.slice(0, 40).map((product) => (
            <div key={product.id} className="border-l border-[#101A15]/12 pl-4">
              ├── {product.name}{" "}
              <StatusPill tone={product.status === "ready" ? "signal" : "attention"}>
                {product.openCount ? `${product.openCount} open` : "ready"}
              </StatusPill>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
