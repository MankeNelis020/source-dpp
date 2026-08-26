"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/source/page-header";
import { SourceLabel } from "@/components/source/ui";
import { useSourceQuery } from "@/client/source/api";
import { BillingSettingsPanel } from "./billing-panel";

const TABS = [
  "Organisation",
  "Members",
  "Roles",
  "Security",
  "Data policies",
  "Permission defaults",
  "Datasets",
  "Billing",
  "Audit log",
  "API",
] as const;

const ROLES = [
  ["Owner", "Everything in this organisation."],
  ["Admin", "Organisation and configuration."],
  ["Member", "Catalogue, cases, and supplier requests."],
  ["Compliance Manager", "Datasets, claims, evidence, exports."],
  ["Procurement Manager", "Suppliers and requests."],
  ["Data Steward", "Identity and evidence review."],
  ["Auditor", "Read-only scoped."],
];

export default function SettingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Organisation");
  const { data: session } = useSourceQuery<{
    memberships?: { organisationId: string; name: string; role: string }[];
    organisationId?: string;
    email?: string;
  }>("/api/session");
  const { data: workspace } = useSourceQuery<{ organisation: { name: string } }>("/api/source/workspace");
  const organisationName =
    workspace?.organisation.name ??
    session?.memberships?.find((row) => row.organisationId === session.organisationId)?.name ??
    "Your organisation";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" />
      <div className="flex gap-2 overflow-x-auto pb-4">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`whitespace-nowrap rounded-sm px-3 py-1.5 text-[12px] ${tab === item ? "bg-[#101A15] text-[#FBFCFA]" : "bg-[#FBFCFA] text-[#101A15]/70"}`}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="border border-[#101A15]/10 bg-[#FBFCFA] p-6 text-[13px] leading-relaxed">
        {tab === "Organisation" ? (
          <div className="space-y-2">
            <Row k="Organisation" v={organisationName} />
            <Row k="Signed in as" v={session?.email ?? ""} />
          </div>
        ) : null}
        {tab === "Roles" ? (
          <ul className="space-y-3">
            {ROLES.map(([name, body]) => (
              <li key={name}>
                <div className="font-[family-name:var(--font-space)] text-[16px]">{name}</div>
                <p className="text-[#101A15]/65">{body}</p>
              </li>
            ))}
          </ul>
        ) : null}
        {tab === "Security" ? (
          <p>Supabase authenticates the human. SOURCE authorizes from organisation membership rows, not user_metadata.</p>
        ) : null}
        {tab === "Billing" ? <BillingSettingsPanel /> : null}
        {tab === "Audit log" ? (
          <p className="text-[#101A15]/65">Tenant audit is available to owners, admins, and auditors from internal APIs.</p>
        ) : null}
        {tab === "API" ? (
          <p>Versioned endpoints under /v1. Webhooks for claim.updated, request.completed, permission.granted.</p>
        ) : null}
        {tab === "Datasets" ? (
          <p>ESPR Aluminium 2027 · required properties versioned. New delegated acts add properties without a database rewrite.</p>
        ) : null}
        {tab === "Members" ? (
          <p>
            <Link href="/app/settings/team" className="underline-offset-4 hover:underline">
              Open team settings
            </Link>
          </p>
        ) : null}
        {tab === "Data policies" || tab === "Permission defaults" ? (
          <p className="text-[#101A15]/65">
            Data belongs to owner_actor_id, not user_id. Offboarding never deletes provenance.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#101A15]/8 py-2">
      <SourceLabel>{k}</SourceLabel>
      <span>{v}</span>
    </div>
  );
}
