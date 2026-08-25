import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noindexMetadata("Create account");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
