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
    <div className="source-theme min-h-full bg-[#EFF2ED] text-[#101A15]">
      <header className="sticky top-0 z-40 border-b border-[#101A15]/8 bg-[#EFF2ED]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/" aria-label="SOURCE home">
            <SourceWordmark size="md" />
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {PUBLIC_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[13px] text-[#101A15]/70 transition-colors hover:text-[#101A15]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <Link href="/login" className="text-[13px] text-[#101A15]/70 hover:text-[#101A15]">
              Sign in
            </Link>
            <SourceButton href="/signup">Connect your supply chain</SourceButton>
          </div>
          <button
            type="button"
            className="md:hidden"
            aria-label="Open menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="block h-px w-5 bg-[#101A15]" />
            <span className="mt-1.5 block h-px w-5 bg-[#101A15]" />
          </button>
        </div>
        {open ? (
          <div className="border-t border-[#101A15]/8 px-5 py-4 md:hidden">
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
      <footer className="mt-24 border-t border-[#101A15]/8">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 md:flex-row md:justify-between">
          <div>
            <SourceWordmark size="sm" />
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-[#101A15]/60">
              The evidence layer for product data. Amsterdam.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 text-[13px]">
            <div className="space-y-2">
              <SourceLabel>Product</SourceLabel>
              <FooterLink href="/product">Product</FooterLink>
              <FooterLink href="/how-it-works">How it works</FooterLink>
              <FooterLink href="/pricing">Pricing</FooterLink>
              <FooterLink href="/developers">Developers</FooterLink>
            </div>
            <div className="space-y-2">
              <SourceLabel>Network</SourceLabel>
              <FooterLink href="/suppliers">For suppliers</FooterLink>
              <FooterLink href="/privacy">Privacy</FooterLink>
              <FooterLink href="/terms">Terms</FooterLink>
              <FooterLink href="/security">Security</FooterLink>
              <FooterLink href="/login">Sign in</FooterLink>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-10">
          <p className="font-[family-name:var(--font-plex)] text-[10px] uppercase tracking-[0.14em] text-[#101A15]/40">
            We never say a claim is true. We show you how it&apos;s known.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("block text-[#101A15]/70 hover:text-[#101A15]")}>
      {children}
    </Link>
  );
}
