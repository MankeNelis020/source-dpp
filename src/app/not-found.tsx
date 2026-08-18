import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/source/public-shell";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-xl px-6 py-24">
        <p className="font-[family-name:var(--font-plex)] text-[10px] uppercase tracking-[0.14em] text-ink/45">
          404
        </p>
        <h1 className="mt-4 font-[family-name:var(--font-space)] text-[32px] font-medium tracking-[-0.02em]">
          This page is not in SOURCE.
        </h1>
        <p className="mt-3 text-[14.5px] text-ink/70">
          The URL does not match a public page. Private workspace screens are not published to search.
        </p>
        <p className="mt-6">
          <Link href="/" className="text-[13px] underline-offset-4 hover:underline">
            Back to SOURCE
          </Link>
        </p>
      </div>
    </PublicShell>
  );
}
