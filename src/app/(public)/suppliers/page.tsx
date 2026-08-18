import type { Metadata } from "next";
import { ClaimCard, EvidenceLine, SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata("/suppliers");

export default function SuppliersPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
      <div className="grid gap-12 md:grid-cols-2 md:items-center">
        <div>
          <SourceLabel>For suppliers</SourceLabel>
          <h1 className="mt-4 font-[family-name:var(--font-space)] text-[40px] font-medium leading-[1.08] tracking-[-0.02em] md:text-[48px]">
            Answer once.
            <br />
            Stay in control.
          </h1>
          <p className="mt-4 text-[14.5px] leading-relaxed text-ink/70">
            When customers request product information through SOURCE, you decide what you provide
            and how it may be reused. This is not a sales site. It should feel like it saves you work.
          </p>
        </div>
        <ClaimCard
          value="67%"
          reuse="verified customers"
          verified
        />
      </div>

      <div className="mt-20 grid gap-8 md:grid-cols-5">
        {["Open request.", "Provide information.", "Upload evidence.", "Choose permissions.", "Done."].map(
          (item, i) => (
            <div key={item}>
              <SourceLabel>{String(i + 1).padStart(2, "0")}</SourceLabel>
              <p className="mt-2 text-[13px] leading-relaxed">{item}</p>
            </div>
          )
        )}
      </div>

      <div className="mt-16 border border-ink/8 bg-card p-8">
        <EvidenceLine />
        <h2 className="mt-4 font-[family-name:var(--font-space)] text-[20px]">
          No implementation required
        </h2>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink/70">
          A scoped magic link is enough. You see only the requested claims, upload evidence, and
          choose who may reuse it. Create a free account afterwards if you want to reuse evidence
          next time — never before you have answered.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <StatusPill tone="signal">Verified customers</StatusPill>
          <StatusPill tone="teal">Request access</StatusPill>
          <StatusPill tone="muted">Verification only</StatusPill>
          <StatusPill tone="attention">Private</StatusPill>
        </div>
        <div className="mt-8">
          <SourceButton href="/s/demo">View example request</SourceButton>
        </div>
      </div>
    </div>
  );
}
