import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/source/workspace-shell";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = noindexMetadata(
  "Workspace",
  "Private SOURCE workspace. This area is not indexed."
);

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
