import Link from "next/link";
import { CATALOGUE_HEALTH } from "@/domain/source/queries";
import { DEMO_COVERAGE } from "@/lib/source/demo-data";
import { PageHeader } from "@/components/source/page-header";
import { Metric, SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";

export default function OverviewPage() {
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={hello}
        description="The homepage answers four questions: what we have, what is missing, where action sits, and what changed. Resolution health matters more than completeness alone."
      />

      <section className="border border-[#101A15]/10 bg-[#FBFCFA] p-6">
        <SourceLabel>Supply chain coverage</SourceLabel>
        <div className="mt-3 font-[family-name:var(--font-plex)] text-[40px] leading-none">68%</div>
        <div className="mt-3 h-1.5 w-full bg-[#101A15]/8">
          <div className="h-full w-[68%] bg-[#0B6E50]" />
        </div>
        <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <SmallStat label="Identity resolved" value={`${DEMO_COVERAGE.identityResolved}%`} />
          <SmallStat label="Evidence covered" value={`${DEMO_COVERAGE.evidenceCovered}%`} />
          <SmallStat label="Immediately reusable" value={`${DEMO_COVERAGE.immediatelyReusable}%`} />
          <SmallStat label="Authorization required" value={`${DEMO_COVERAGE.authorizationRequired}%`} />
        </div>
      </section>

      <section className="mt-8 border border-[#101A15]/10 bg-[#FBFCFA] p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <SourceLabel>Resolution health</SourceLabel>
            <p className="mt-2 max-w-lg text-[13px] text-[#101A15]/65">
              Missing information is a normal state. SOURCE tracks why it is missing, not only that it is missing.
            </p>
          </div>
          <SourceButton href="/app/missing" variant="ghost">
            Open cases
          </SourceButton>
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <HealthStat href="/app/missing" n="8,614" label="Missing" />
          <HealthStat href="/app/missing" n="5,811" label="In progress" />
          <HealthStat href="/app/missing" n="1,940" label="Waiting supplier" />
          <HealthStat href="/app/missing" n="431" label="Waiting upstream" />
          <HealthStat href="/app/missing" n="217" label="Authorization required" />
          <HealthStat href="/app/missing" n="83" label="Conflict" />
          <HealthStat href="/app/missing" n="132" label="Unresolved" />
          <HealthStat href="/app/missing" n="713" label="Products unlocked this month" tone="signal" />
        </div>
        <p className="mt-4 hidden">{CATALOGUE_HEALTH.missing}</p>
      </section>

      <h2 className="mt-12 font-[family-name:var(--font-space)] text-[20px] tracking-[-0.02em]">
        Needs attention
      </h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Attention href="/app/reviews" n="117" label="Identity matches to review" />
        <Attention href="/app/missing" n="8,614" label="Missing information cases" />
        <Attention href="/app/evidence" n="317" label="Evidence items expiring soon" tone="attention" />
        <Attention href="/app/requests" n="14" label="Supplier requests overdue" tone="attention" />
      </div>

      <div className="mt-12 grid gap-8 sm:grid-cols-4">
        <Metric value="8,421" label="Products" />
        <Metric value="684" label="Suppliers" />
        <Metric value="72%" label="Resolved automatically" />
        <Metric value="31%" label="Evidence coverage" hint="Pilot snapshot after first import" />
      </div>

      <div className="mt-10">
        <SourceButton href="/app/import">Find missing data · Analyse catalogue</SourceButton>
      </div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-[family-name:var(--font-plex)] text-[18px]">{value}</div>
      <SourceLabel className="mt-1 block">{label}</SourceLabel>
    </div>
  );
}

function HealthStat({
  href,
  n,
  label,
  tone,
}: {
  href: string;
  n: string;
  label: string;
  tone?: "signal";
}) {
  return (
    <Link href={href} className="block">
      <div className={`font-[family-name:var(--font-plex)] text-[22px] ${tone === "signal" ? "text-[#0B6E50]" : ""}`}>
        {n}
      </div>
      <SourceLabel className="mt-1 block">{label}</SourceLabel>
    </Link>
  );
}

function Attention({
  href,
  n,
  label,
  tone = "neutral",
}: {
  href: string;
  n: string;
  label: string;
  tone?: "neutral" | "attention";
}) {
  return (
    <Link href={href} className="flex items-center justify-between border border-[#101A15]/10 bg-[#FBFCFA] px-5 py-4 hover:border-[#0B6E50]/40">
      <div>
        <div className="font-[family-name:var(--font-plex)] text-[22px]">{n}</div>
        <p className="mt-1 text-[13px] text-[#101A15]/65">{label}</p>
      </div>
      <StatusPill tone={tone}>{tone === "attention" ? "Action" : "Review"}</StatusPill>
    </Link>
  );
}
