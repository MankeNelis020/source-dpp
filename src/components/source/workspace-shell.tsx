"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore, useState } from "react";
import { WORKSPACE_NAV } from "@/lib/source/brand";
import { DEMO_ORG } from "@/lib/source/demo-data";
import { clearSession, readSession, subscribeSession } from "@/lib/session";
import { SourceWordmark } from "./wordmark";
import { Mono, SourceLabel, StatusPill } from "./ui";
import { cn } from "@/lib/utils";
import { CommandSearch } from "./command-search";
import { useSourceQuery } from "@/client/source/api";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const session = useSyncExternalStore(subscribeSession, readSession, () => null);

  return (
    <div className="source-theme flex min-h-full bg-[#EFF2ED] text-[#101A15]">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-[#101A15]/8 bg-[#EFF2ED] md:flex">
        <div className="px-5 py-5">
          <Link href="/" aria-label="SOURCE">
            <SourceWordmark size="sm" />
          </Link>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3">
          {WORKSPACE_NAV.map((item) => {
            const active =
              item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-sm px-2.5 py-1.5 text-[13px] text-[#101A15]/65 transition-colors hover:bg-[#101A15]/5 hover:text-[#101A15]",
                  active && "bg-[#101A15]/6 text-[#101A15]"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2 border-t border-[#101A15]/8 px-4 py-4">
          <SourceLabel>Organisation</SourceLabel>
          <div className="text-[13px]">{session?.organisation ?? DEMO_ORG.name}</div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <Mono className="truncate text-[11px] text-[#101A15]/55">
              {session?.email ?? "demo@source.eu"}
            </Mono>
            {session ? (
              <button
                type="button"
                className="text-[11px] text-[#101A15]/50 hover:text-[#101A15]"
                onClick={() => {
                  clearSession();
                  void fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                  router.push("/");
                }}
              >
                Sign out
              </button>
            ) : (
              <Link href="/login?next=/app" className="text-[11px] text-[#101A15]/50 hover:text-[#101A15]">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[#101A15]/8 bg-[#EFF2ED]/90 px-4 backdrop-blur md:px-8">
          <button
            type="button"
            className="md:hidden"
            aria-label="Open menu"
            onClick={() => setOpen((v) => !v)}
          >
            <SourceWordmark size="sm" />
          </button>
          <div className="hidden md:block">
            <ImportBanner />
          </div>
          <CommandSearch />
        </header>
        {open ? (
          <div className="border-b border-[#101A15]/8 px-4 py-3 md:hidden">
            {WORKSPACE_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block py-1.5 text-[13px]"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ) : null}
        <div className="flex-1 px-4 py-8 md:px-8">{children}</div>
      </div>
    </div>
  );
}

function ImportBanner() {
  const { data } = useSourceQuery<{ jobs: { id: string; state: string; processedCount: number; totalCount: number }[] }>("/api/imports");
  const running = data?.jobs.find((j) => j.state !== "COMPLETE" && j.state !== "FAILED" && j.state !== "PARTIAL");
  if (!running) {
    return <StatusPill tone="muted">Server-backed workspace</StatusPill>;
  }
  const pct = running.totalCount ? Math.round((running.processedCount / running.totalCount) * 100) : 0;
  return <StatusPill tone="teal">Import running · {pct}%</StatusPill>;
}
