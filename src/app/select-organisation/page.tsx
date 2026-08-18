"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SourceButton } from "@/components/source/ui";
import { AuthChrome } from "@/components/source/auth-chrome";
import { api } from "@/client/source/api";

export default function SelectOrganisationPage() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<{ organisationId: string; name: string; role: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ memberships: { organisationId: string; name: string; role: string }[] }>("/api/organisations")
      .then((data) => setMemberships(data.memberships))
      .catch(() => setError("Sign in to choose a workspace."));
  }, []);

  async function choose(organisationId: string) {
    await api("/api/organisations/switch", {
      method: "POST",
      body: JSON.stringify({ organisationId }),
    });
    router.push("/app");
    router.refresh();
  }

  return (
    <AuthChrome title="Choose a workspace" description="You belong to more than one organisation.">
      {error ? <p className="text-[13px] text-[#B26B2C]">{error}</p> : null}
      <div className="space-y-2">
        {memberships.map((row) => (
          <button
            key={row.organisationId}
            type="button"
            onClick={() => void choose(row.organisationId)}
            className="w-full border border-[#101A15]/10 bg-[#FBFCFA] px-4 py-3 text-left hover:border-[#0B6E50]/40"
          >
            <div className="font-[family-name:var(--font-space)] text-[16px]">{row.name}</div>
            <div className="mt-1 text-[12px] text-[#101A15]/55">{row.role}</div>
          </button>
        ))}
      </div>
      <div className="mt-6">
        <SourceButton href="/onboarding/organisation" variant="ghost" className="w-full">
          Create another organisation
        </SourceButton>
      </div>
    </AuthChrome>
  );
}
