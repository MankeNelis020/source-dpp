"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { WORKSPACE_NAV } from "@/lib/source/brand";
import { DEMO_ORG } from "@/lib/source/demo-data";
import { clearSession, readSession, subscribeSession } from "@/lib/session";
import { SourceWordmark } from "./wordmark";
import { Mono, SourceLabel, StatusPill } from "./ui";
import { cn } from "@/lib/utils";
import { CommandSearch } from "./command-search";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const session = useSyncExternalStore(subscribeSession, readSession, () => null);

  return (
    <div className="source-theme flex min-h-full text-ink">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ink/8 bg-paper md:flex">
        <div className="px-5 py-6">
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
                  "relative px-2.5 py-1.5 text-[13px] transition-colors",
                  active
                    ? "bg-ink/[0.04] text-ink"
                    : "text-ink/60 hover:bg-ink/[0.03] hover:text-ink"
                )}
              >
                {active ? (
                  <span aria-hidden className="absolute inset-y-1.5 left-0 w-[2px] bg-signal" />
                ) : null}
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2 border-t border-ink/8 px-4 py-4">
          <SourceLabel>Organisation</SourceLabel>
          <div className="text-[13px]">{session?.organisation ?? DEMO_ORG.name}</div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <Mono className="truncate text-[11px] text-ink/55">
              {session?.email ?? "demo@source-dpp.eu"}
            </Mono>
            {session ? (
              <button
                type="button"
                className="text-[11px] text-ink/50 hover:text-ink"
                onClick={() => {
                  clearSession();
                  router.push("/");
                }}
              >
                Sign out
              </button>
            ) : (
              <Link href="/login?next=/app" className="text-[11px] text-ink/50 hover:text-ink">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-ink/8 bg-paper px-4 md:px-8">
          <button
            type="button"
            className="md:hidden"
            aria-label="Open menu"
            onClick={() => setOpen((v) => !v)}
          >
            <SourceWordmark size="sm" />
          </button>
          <div className="hidden md:block">
            <StatusPill tone="muted">Demo workspace</StatusPill>
          </div>
          <CommandSearch />
        </header>
        {open ? (
          <div className="border-b border-ink/8 bg-paper px-4 py-3 md:hidden">
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
        <div className="flex-1 px-4 py-10 md:px-8">{children}</div>
      </div>
    </div>
  );
}
