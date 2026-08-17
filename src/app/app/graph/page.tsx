import { URBAN_CHAIR_COMPONENTS } from "@/lib/source/demo-data";
import { PageHeader } from "@/components/source/page-header";
import { StatusPill } from "@/components/source/ui";

export default function GraphPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Graph"
        description="Not the default interface. Useful for analysis. Permissions decide what is visible — a shielded upstream supplier appears as a verified upstream source, not a company name."
      />
      <div className="border border-ink/8 bg-card p-8 font-[family-name:var(--font-plex)] text-[13px] leading-8">
        <div>Urban Chair 04</div>
        <div className="text-ink/50">↓ Product · Components · Suppliers · Materials · Claims · Evidence</div>
        {URBAN_CHAIR_COMPONENTS.map((c) => (
          <div key={c.id} className="border-l border-ink/12 pl-4">
            ├── {c.name}{" "}
            <StatusPill
              tone={c.status === "ready" ? "signal" : c.status === "missing" ? "attention" : "teal"}
            >
              {c.label}
            </StatusPill>
            {c.id === "textile" ? (
              <div className="pl-6 text-ink/45">└── Verified upstream source</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
