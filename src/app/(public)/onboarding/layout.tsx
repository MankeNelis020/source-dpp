import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noindexMetadata("Onboarding");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
