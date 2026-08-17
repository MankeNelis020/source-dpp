import { PageHeader } from "@/components/source/page-header";
import { SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";

const CONNECTORS = [
  { name: "SAP", status: "not connected", last: "—", objects: 0 },
  { name: "Microsoft Dynamics", status: "not connected", last: "—", objects: 0 },
  { name: "CSV Sync", status: "connected", last: "12 Aug 2026", objects: 8421 },
  { name: "API", status: "connected", last: "15 Aug 2026", objects: 318 },
  { name: "PIM", status: "not connected", last: "—", objects: 0 },
  { name: "PLM", status: "not connected", last: "—", objects: 0 },
];

export default function IntegrationsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Integrations"
        description="V1 is CSV/XLSX plus a generic API. Native SAP is explicitly out of scope. Connectors deliver source records, not business rules."
      />
      <div className="grid gap-3 md:grid-cols-2">
        {CONNECTORS.map((c) => (
          <article key={c.name} className="border border-[#101A15]/10 bg-[#FBFCFA] p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-[family-name:var(--font-space)] text-[20px]">{c.name}</h2>
              <StatusPill tone={c.status === "connected" ? "signal" : "muted"}>{c.status}</StatusPill>
            </div>
            <p className="mt-3 font-[family-name:var(--font-plex)] text-[12px] text-[#101A15]/60">
              Last sync {c.last}
              <br />
              Objects imported {c.objects}
            </p>
            <div className="mt-4 flex gap-2">
              <SourceButton href="/app/import" variant="ghost">
                Sync now
              </SourceButton>
              <SourceButton href="/app/settings" variant="ghost">
                Settings
              </SourceButton>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-6">
        <SourceLabel>Errors surface as counts to review, never only “something went wrong.”</SourceLabel>
      </p>
    </div>
  );
}
