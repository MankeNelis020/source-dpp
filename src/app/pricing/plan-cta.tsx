"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SourceButton } from "@/components/source/ui";
import { api } from "@/client/source/api";
import {
  SELECTED_PLAN_STORAGE_KEY,
  type BillingCheckoutKind,
  type BillingPlanId,
} from "@/domain/billing/plans";

function rememberPlan(planId: BillingPlanId) {
  try {
    sessionStorage.setItem(SELECTED_PLAN_STORAGE_KEY, planId);
  } catch {
    /* ignore quota / private mode */
  }
}

export function PlanCheckoutButton({
  planId,
  checkout,
  salesEmail,
  highlighted,
}: {
  planId: BillingPlanId;
  checkout: BillingCheckoutKind;
  salesEmail?: string | null;
  highlighted?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label =
    checkout === "contact_sales" ? "Contact sales" : checkout === "signup" ? "Start free" : "Choose plan";

  async function onClick() {
    setError(null);
    rememberPlan(planId);

    if (checkout === "contact_sales") {
      if (salesEmail) {
        window.location.href = `mailto:${salesEmail}?subject=${encodeURIComponent("SOURCE Enterprise")}`;
        return;
      }
      router.push("/signup?plan=enterprise");
      return;
    }

    if (checkout === "signup") {
      router.push("/signup?plan=free");
      return;
    }

    setPending(true);
    try {
      const result = await api<{ url: string }>("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planId }),
      });
      window.location.href = result.url;
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : 0;
      if (status === 401) {
        router.push(`/signup?plan=${encodeURIComponent(planId)}`);
        return;
      }
      setError(err instanceof Error ? err.message : "Checkout is unavailable.");
      setPending(false);
    }
  }

  return (
    <div className="mt-6">
      <SourceButton
        className="w-full"
        onClick={() => void onClick()}
        disabled={pending}
        variant={highlighted ? "primary" : "ghost"}
      >
        {pending ? "Redirecting…" : label}
      </SourceButton>
      {error ? <p className="mt-2 text-[12px] text-[#B26B2C]">{error}</p> : null}
    </div>
  );
}
