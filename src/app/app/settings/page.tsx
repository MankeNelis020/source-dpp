"use client";

import { useState } from "react";
import { DEMO_ORG } from "@/lib/source/demo-data";
import { PageHeader } from "@/components/source/page-header";
import { SourceLabel } from "@/components/source/ui";

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
  ["Owner", "Everything."],
  ["Admin", "Organisation and configuration."],
  ["Compliance Manager", "Datasets, claims, evidence, exports."],
  ["Procurement Manager", "Suppliers and requests."],
  ["Data Steward", "Identity and evidence review."],
  ["Auditor", "Read-only scoped."],
];

export default function SettingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Organisation");
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
            <Row k="Legal name" v={DEMO_ORG.legalName} />
            <Row k="KVK" v={DEMO_ORG.kvk} />
            <Row k="VAT" v={DEMO_ORG.vat} />
            <Row k="Country" v={DEMO_ORG.country} />
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
          <p>MFA for admins. Scoped magic links. Session revoke. EU data residency. Tenant isolation.</p>
        ) : null}
        {tab === "Billing" ? (
          <p>421 / 500 active supplier relationships · Core plan. Catalogue tier and storage are secondary meters.</p>
        ) : null}
        {tab === "Audit log" ? (
          <ul className="space-y-2 font-[family-name:var(--font-plex)] text-[12px]">
            <li>15 Aug · Evidence uploaded · cert-92831.pdf</li>
            <li>15 Aug · Identity matched · Supplier A GmbH</li>
            <li>14 Aug · Request sent · Supplier A</li>
            <li>12 Aug · CSV sync · 8,421 products</li>
          </ul>
        ) : null}
        {tab === "API" ? (
          <p>Versioned endpoints under /v1. Webhooks for claim.updated, request.completed, permission.granted.</p>
        ) : null}
        {tab === "Datasets" ? (
          <p>ESPR Aluminium 2027 · required properties versioned. New delegated acts add properties without a database rewrite.</p>
        ) : null}
        {tab === "Members" || tab === "Data policies" || tab === "Permission defaults" ? (
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
