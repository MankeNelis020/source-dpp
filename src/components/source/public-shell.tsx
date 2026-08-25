import Link from "next/link";
import { PUBLIC_NAV } from "@/lib/source/brand";
import { PRIMARY_CTA } from "@/lib/source/copy";
import { SourceWordmark } from "./wordmark";
import { SourceButton, SourceLabel } from "./ui";
import { PublicMobileNav } from "./public-mobile-nav";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="source-theme min-h-full text-ink">
      <header className="sticky top-0 z-40 border-b border-ink/8 bg-paper">
        <div className="relative mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between gap-6 px-6">
          <Link href="/" aria-label="SOURCE home" className="shrink-0">
            <SourceWordmark size="md" />
          </Link>
          <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
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
            <SourceButton href={PRIMARY_CTA.href}>{PRIMARY_CTA.label}</SourceButton>
          </div>
          <PublicMobileNav />
        </div>
      </header>
      <main>{children}</main>
      <footer className="mt-28 border-t border-ink/8 bg-paper">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-14 md:grid-cols-4">
          <div>
            <SourceWordmark size="sm" />
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-ink/55">
              Product evidence resolution for European manufacturers. Amsterdam. SOURCE prepares
              evidence before DPP publication; it does not publish passports or create data carriers.
            </p>
          </div>
          <FooterCol label="Product">
            <FooterLink href="/product">Product</FooterLink>
            <FooterLink href="/how-it-works">How it works</FooterLink>
            <FooterLink href="/manufacturers">Manufacturers</FooterLink>
            <FooterLink href="/suppliers">Suppliers</FooterLink>
            <FooterLink href="/pricing">Pricing</FooterLink>
            <FooterLink href="/developers">Developers</FooterLink>
          </FooterCol>
          <FooterCol label="Evidence and DPP">
            <FooterLink href="/dpp-readiness">DPP readiness</FooterLink>
            <FooterLink href="/digital-product-passport">DPP knowledge hub</FooterLink>
            <FooterLink href="/methodology">Methodology</FooterLink>
            <FooterLink href="/resources">Resources</FooterLink>
            <FooterLink href="/resources/glossary">Glossary</FooterLink>
            <FooterLink href="/faq">FAQ</FooterLink>
          </FooterCol>
          <FooterCol label="Company">
            <FooterLink href="/about">About</FooterLink>
            <FooterLink href="/authors/source-research">SOURCE Research</FooterLink>
            <FooterLink href="/login">Sign in</FooterLink>
            <FooterLink href={PRIMARY_CTA.href}>{PRIMARY_CTA.label}</FooterLink>
          </FooterCol>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-12">
          <p className="font-[family-name:var(--font-plex)] text-[10px] uppercase tracking-[0.14em] text-ink/40">
            We never say a claim is true. We show you how it&apos;s known. Not legal advice. SOURCE
            does not replace ERP, PIM, PLM, or DPP platforms.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5 text-[13px]">
      <SourceLabel>{label}</SourceLabel>
      {children}
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block text-ink/65 hover:text-ink">
      {children}
    </Link>
  );
}
