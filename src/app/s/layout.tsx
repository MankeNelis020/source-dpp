import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noindexMetadata(
  "Supplier request",
  "Private supplier request. This area is not indexed."
);

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return <div className="source-theme min-h-full text-ink">{children}</div>;
}
