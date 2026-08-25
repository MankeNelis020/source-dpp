"use client";

import Link from "next/link";
import { useState } from "react";
import { PUBLIC_NAV } from "@/lib/source/brand";
import { PRIMARY_CTA } from "@/lib/source/copy";
import { SourceButton } from "./ui";

export function PublicMobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button
        type="button"
        className="flex min-h-[44px] min-w-[44px] flex-col items-end justify-center gap-[5px]"
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
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex min-h-[44px] items-center"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/suppliers"
              className="inline-flex min-h-[44px] items-center"
              onClick={() => setOpen(false)}
            >
              Suppliers
            </Link>
            <Link
              href="/faq"
              className="inline-flex min-h-[44px] items-center"
              onClick={() => setOpen(false)}
            >
              FAQ
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-[44px] items-center"
              onClick={() => setOpen(false)}
            >
              Sign in
            </Link>
            <SourceButton href={PRIMARY_CTA.href} onClick={() => setOpen(false)}>
              {PRIMARY_CTA.label}
            </SourceButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
