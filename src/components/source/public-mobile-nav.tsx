"use client";

import Link from "next/link";
import { useState } from "react";
import { PUBLIC_NAV } from "@/lib/source/brand";
import { SourceButton } from "./ui";

export function PublicMobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button
        type="button"
        className="flex flex-col items-end gap-[5px]"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="block h-px w-5 bg-ink" />
        <span className="block h-px w-4 bg-ink" />
      </button>
      {open ? (
        <div className="absolute inset-x-0 top-[4.5rem] z-40 border-b border-ink/8 bg-paper px-6 py-5">
          <div className="flex flex-col gap-3">
            {PUBLIC_NAV.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
            <Link href="/digital-product-passport" onClick={() => setOpen(false)}>
              Digital Product Passport
            </Link>
            <Link href="/login" onClick={() => setOpen(false)}>
              Sign in
            </Link>
            <SourceButton href="/signup">Check my catalogue</SourceButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
