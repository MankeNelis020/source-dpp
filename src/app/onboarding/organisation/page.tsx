"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SourceButton } from "@/components/source/ui";
import { AuthChrome, AuthField } from "@/components/source/auth-chrome";
import { api } from "@/client/source/api";
import { billingPlanById, parseBillingPlanId, SELECTED_PLAN_STORAGE_KEY } from "@/domain/billing/plans";

function readSelectedPlan() {
  try {
    return parseBillingPlanId(sessionStorage.getItem(SELECTED_PLAN_STORAGE_KEY));
  } catch {
    return undefined;
  }
}

function clearSelectedPlan() {
  try {
    sessionStorage.removeItem(SELECTED_PLAN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export default function OrganisationOnboardingPage() {
  const router = useRouter();
  const idempotencyKey = useRef(crypto.randomUUID());
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState(false);

  async function continueAfterCreate() {
    const planId = readSelectedPlan();
    const plan = planId ? billingPlanById(planId) : undefined;
    if (plan?.checkout === "checkout") {
      setCheckoutPending(true);
      try {
        const result = await api<{ url: string }>("/api/billing/checkout", {
          method: "POST",
          body: JSON.stringify({ planId: plan.id }),
        });
        clearSelectedPlan();
        window.location.href = result.url;
        return;
      } catch {
        setCheckoutPending(false);
        setReady(true);
        return;
      }
    }
    clearSelectedPlan();
    setReady(true);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/api/organisations", {
        method: "POST",
        body: JSON.stringify({
          name,
          country,
          website: website || undefined,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      await continueAfterCreate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't create the workspace.");
    } finally {
      setPending(false);
    }
  }

  if (checkoutPending) {
    return (
      <AuthChrome title="Opening checkout…" description="We'll send you to Stripe to start the subscription.">
        <p className="text-[13px] text-[#101A15]/65">This should only take a moment.</p>
      </AuthChrome>
    );
  }

  if (ready) {
    return (
      <AuthChrome title="Your workspace is ready." description="Upload the data you already have. SOURCE will work out what's missing.">
        <SourceButton className="w-full" onClick={() => router.push("/app/import")}>
          Import catalogue
        </SourceButton>
      </AuthChrome>
    );
  }

  return (
    <AuthChrome title="What should we call your workspace?" description="Start by creating your organisation.">
      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <AuthField label="Company name" required value={name} onChange={setName} />
        <AuthField label="Country" required value={country} onChange={setCountry} />
        <AuthField label="Website (optional)" type="url" value={website} onChange={setWebsite} />
        {error ? <p className="text-[13px] text-[#B26B2C]">{error}</p> : null}
        <SourceButton type="submit" className="w-full" disabled={pending}>
          {pending ? "Creating…" : "Create workspace"}
        </SourceButton>
      </form>
    </AuthChrome>
  );
}
