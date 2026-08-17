"use client";

import Link from "next/link";
import { useState } from "react";
import { PUBLIC_NAV } from "@/lib/source/brand";
import { SourceWordmark } from "./wordmark";
import { SourceButton, SourceLabel } from "./ui";
import { cn } from "@/lib/utils";

export function PublicShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="source-theme min-h-full text-ink">
      <header className="sticky top-0 z-40 border-b border-ink/8 bg-paper">
        <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between gap-6 px-6">
          <Link href="/" aria-label="SOURCE home" className="shrink-0">
            <SourceWordmark size="md" />
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            {PUBLIC_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[13px] text-ink/65 transition-colors hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-4 md:flex">
            <Link href="/login" className="text-[13px] text-ink/65 hover:text-ink">
              Sign in
            </Link>
            <SourceButton href="/signup">Connect your supply chain</SourceButton>
          </div>
          <button
            type="button"
            className="flex flex-col items-end gap-[5px] md:hidden"
            aria-label="Open menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="block h-px w-5 bg-ink" />
            <span className="block h-px w-4 bg-ink" />
          </button>
        </div>
        {open ? (
          <div className="border-t border-ink/8 bg-paper px-6 py-5 md:hidden">
            <div className="flex flex-col gap-3">
              {PUBLIC_NAV.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                  {item.label}
                </Link>
              ))}
              <Link href="/login" onClick={() => setOpen(false)}>
                Sign in
              </Link>
              <SourceButton href="/signup">Connect your supply chain</SourceButton>
            </div>
          </div>
        ) : null}
      </header>
      <main>{children}</main>
      <footer className="mt-28 border-t border-ink/8 bg-paper">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-14 md:flex-row md:justify-between">
          <div>
            <SourceWordmark size="sm" />
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-ink/55">
              The evidence layer for product data. Amsterdam.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-12 text-[13px]">
            <div className="space-y-2.5">
              <SourceLabel>Product</SourceLabel>
              <FooterLink href="/product">Product</FooterLink>
              <FooterLink href="/how-it-works">How it works</FooterLink>
              <FooterLink href="/pricing">Pricing</FooterLink>
              <FooterLink href="/developers">Developers</FooterLink>
            </div>
            <div className="space-y-2.5">
              <SourceLabel>Network</SourceLabel>
              <FooterLink href="/suppliers">For suppliers</FooterLink>
              <FooterLink href="/login">Sign in</FooterLink>
              <FooterLink href="/app">Demo workspace</FooterLink>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-12">
          <p className="font-[family-name:var(--font-plex)] text-[10px] uppercase tracking-[0.14em] text-ink/40">
            We never say a claim is true. We show you how it&apos;s known.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("block text-ink/65 hover:text-ink")}>
      {children}
    </Link>
  );
}
