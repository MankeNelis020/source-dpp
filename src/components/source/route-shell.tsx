"use client";

import { usePathname } from "next/navigation";
import { PublicShell } from "./public-shell";
import { WorkspaceShell } from "./workspace-shell";

function isWorkspace(pathname: string) {
  return pathname === "/app" || pathname.startsWith("/app/") || pathname.startsWith("/s/");
}

export function RouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  if (isWorkspace(pathname)) {
    if (pathname.startsWith("/s/")) {
      return <div className="source-theme min-h-full bg-[#EFF2ED] text-[#101A15]">{children}</div>;
    }
    return <WorkspaceShell>{children}</WorkspaceShell>;
  }
  return <PublicShell>{children}</PublicShell>;
}
