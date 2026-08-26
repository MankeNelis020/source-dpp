"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SourceButton, SourceLabel } from "@/components/source/ui";
import { api } from "@/client/source/api";

function SuccessBody() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<{
    planName?: string;
    status?: string;
    currentPeriodEnd?: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ planName: string; status: string; currentPeriodEnd: string | null }>("/api/billing/status")
      .then((data) => {
        setStatus(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "We couldn't load billing status.");
      });
  }, [searchParams]);

  return (
    <div className="mx-auto max-w-xl px-5 py-16 md:py-24">
      <SourceLabel>Billing</SourceLabel>
      <h1 className="mt-4 font-[family-name:var(--font-space)] text-[36px] font-medium leading-tight tracking-[-0.03em]">
        Payment received.
      </h1>
      <p className="mt-4 text-[14.5px] leading-relaxed text-[#101A15]/70">
        Stripe Checkout completed. Subscription status is recorded when the Stripe webhook arrives —
        it can take a few seconds.
      </p>
      {status ? (
        <dl className="mt-8 space-y-2 border border-[#101A15]/10 bg-[#FBFCFA] p-5 text-[13px]">
          <div className="flex justify-between gap-4">
            <dt className="text-[#101A15]/55">Plan</dt>
            <dd>{status.planName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#101A15]/55">Status</dt>
            <dd>{status.status}</dd>
          </div>
        </dl>
      ) : null}
      {error ? <p className="mt-4 text-[13px] text-[#B26B2C]">{error}</p> : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <SourceButton href="/app">Open workspace</SourceButton>
        <Link href="/app/settings" className="px-4 py-2.5 text-[13px] underline-offset-4 hover:underline">
          Billing settings
        </Link>
      </div>
    </div>
  );
}

export default function PricingSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-xl px-5 py-24 text-[13px] text-[#101A15]/50">
          Confirming payment…
        </div>
      }
    >
      <SuccessBody />
    </Suspense>
  );
}
