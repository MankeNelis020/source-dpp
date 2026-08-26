"use client";

import { useState } from "react";
import Link from "next/link";
import { SourceButton, SourceLabel } from "@/components/source/ui";
import { api, useSourceQuery } from "@/client/source/api";

type BillingStatus = {
  configured: boolean;
  planId: string;
  planName: string;
  priceLabel: string;
  status: string;
  currentPeriodEnd: string | null;
  hasCustomer: boolean;
  canManage: boolean;
};

export function BillingSettingsPanel() {
  const { data, error, loading, reload } = useSourceQuery<BillingStatus>("/api/billing/status");
  const [pending, setPending] = useState<"portal" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function openPortal() {
    setActionError(null);
    setPending("portal");
    try {
      const result = await api<{ url: string }>("/api/billing/portal", { method: "POST", body: "{}" });
      window.location.href = result.url;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Billing portal is unavailable.");
      setPending(null);
    }
  }

  if (loading) return <p className="text-[#101A15]/65">Loading billing…</p>;
  if (error || !data) return <p className="text-[#B26B2C]">{error ?? "Billing status is unavailable."}</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between gap-4 border-b border-[#101A15]/8 py-2">
        <SourceLabel>Plan</SourceLabel>
        <span>
          {data.planName} · {data.priceLabel}
        </span>
      </div>
      <div className="flex justify-between gap-4 border-b border-[#101A15]/8 py-2">
        <SourceLabel>Status</SourceLabel>
        <span>{data.status}</span>
      </div>
      {data.currentPeriodEnd ? (
        <div className="flex justify-between gap-4 border-b border-[#101A15]/8 py-2">
          <SourceLabel>Current period end</SourceLabel>
          <span>{data.currentPeriodEnd.slice(0, 10)}</span>
        </div>
      ) : null}
      {!data.configured ? (
        <p className="text-[#101A15]/65">
          Stripe keys are not configured in this environment yet. Checkout stays closed until they are
          set in Vercel.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3 pt-2">
        <SourceButton href="/pricing">Change plan</SourceButton>
        {data.canManage && data.hasCustomer ? (
          <SourceButton variant="ghost" onClick={() => void openPortal()} disabled={pending === "portal"}>
            {pending === "portal" ? "Opening…" : "Manage billing"}
          </SourceButton>
        ) : null}
        <button type="button" className="text-[12px] text-[#101A15]/55 underline-offset-4 hover:underline" onClick={reload}>
          Refresh
        </button>
      </div>
      {actionError ? <p className="text-[13px] text-[#B26B2C]">{actionError}</p> : null}
      <p className="text-[12px] text-[#101A15]/50">
        Invoices and payment methods are managed in Stripe Customer Portal.{" "}
        <Link href="/pricing" className="underline-offset-4 hover:underline">
          View plans
        </Link>
        .
      </p>
    </div>
  );
}
