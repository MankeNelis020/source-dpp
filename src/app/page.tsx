import { HeroGraph } from "@/components/source/hero-graph";
import { IdentityDemo } from "@/components/source/identity-demo";
import {
  ClaimCard,
  ConfidenceRamp,
  Display,
  EvidenceLine,
  Metric,
  SourceButton,
  SourceLabel,
  StatusPill,
} from "@/components/source/ui";

export default function HomePage() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-2 md:items-center md:gap-0 md:divide-x md:divide-ink/8 md:py-28">
        <div className="md:pr-12">
          <SourceLabel>Trusted product claims infrastructure</SourceLabel>
          <h1 className="mt-5 font-[family-name:var(--font-space)] text-[40px] font-medium leading-[1.05] tracking-[-0.02em] text-ink md:text-[64px]">
            Make every product claim{" "}
            <span className="whitespace-nowrap">
              traceable
              <EvidenceLine className="mt-0 w-full" />
            </span>{" "}
            to evidence.
          </h1>
          <p className="mt-6 max-w-md text-[14.5px] leading-relaxed text-ink/70">
            Connect your product system. SOURCE resolves what you have, what&apos;s missing, what
            can be trusted and what may be reused — one supplier at a time, not one SKU at a time.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <SourceButton href="/signup">Connect your catalogue</SourceButton>
            <SourceButton href="/how-it-works" variant="ghost">
              See how it works
            </SourceButton>
          </div>
        </div>
        <div className="space-y-4 md:pl-12">
          <ClaimCard />
          <HeroGraph />
        </div>
      </section>

      <section className="border-y border-ink/8 bg-card">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Display as="h2" size="md">
            Your ERP knows what you bought.
            <br />
            SOURCE discovers what&apos;s behind it.
          </Display>
          <div className="mt-12 grid gap-10 sm:grid-cols-3">
            <Metric value="8,421" label="Products imported" />
            <Metric value="684" label="Supplier relationships" />
            <Metric value="61%" label="Evidence covered" />
          </div>
          <p className="mt-12 max-w-xl text-[14.5px] leading-relaxed text-ink/70">
            Product information lives across suppliers, spreadsheets, certificates, ERP systems and
            inboxes. SOURCE connects it.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <SectionEyebrow>Van administratie naar bewijs — in vier stappen</SectionEyebrow>
        <div className="mt-12 grid gap-10 md:grid-cols-4 md:gap-8">
          <Step n="01" title="Connect">
            Connect ERP, PIM, PLM, API or upload your existing files.
          </Step>
          <Step n="02" title="Resolve">
            SOURCE identifies products, suppliers, materials and existing evidence.
          </Step>
          <Step n="03" title="Collect">
            Missing information is automatically requested from the right supplier.
          </Step>
          <Step n="04" title="Trust">
            Claims are connected to evidence and controlled permissions.
          </Step>
        </div>
        <div className="mt-12">
          <SourceButton href="/product" variant="ghost">
            See the product →
          </SourceButton>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <SectionEyebrow>Identity resolution</SectionEyebrow>
        <Display as="h2" size="md" className="mt-4 max-w-xl">
          Different systems. Same supplier.
        </Display>
        <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink/70">
          SOURCE resolves messy supplier and product identities before collecting new information.
        </p>
        <div className="mt-10">
          <IdentityDemo />
        </div>
      </section>

      <section className="mt-20 bg-ink text-card">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 md:grid-cols-2 md:items-center md:gap-0 md:divide-x md:divide-card/10">
          <div className="md:pr-12">
            <SourceLabel className="text-card/50">For suppliers</SourceLabel>
            <h2 className="mt-4 font-[family-name:var(--font-space)] text-[33px] font-medium tracking-[-0.02em]">
              Stop answering the same question twice.
            </h2>
            <p className="mt-4 text-[14.5px] leading-relaxed text-card/70">
              Suppliers can provide product evidence once and decide how it may be reused.
            </p>
            <div className="mt-8">
              <SourceButton href="/suppliers" variant="ghost" className="text-card ring-card/20">
                SOURCE for suppliers
              </SourceButton>
            </div>
          </div>
          <article className="border border-card/12 bg-ink p-8 md:ml-12">
            <SourceLabel className="text-card/50">Recycling claim</SourceLabel>
            <div className="mt-3 font-[family-name:var(--font-space)] text-[48px] leading-none tracking-[-0.02em]">
              67%
            </div>
            <span className="mt-2 block h-[2.5px] w-16 bg-signal" />
            <div className="mt-4">
              <StatusPill tone="signal">Evidence available</StatusPill>
            </div>
            <ul className="mt-6 space-y-2 font-[family-name:var(--font-plex)] text-[12px] text-card/75">
              <li>● Verified customers</li>
              <li className="text-card/40">○ Request access</li>
              <li className="text-card/40">○ Private</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <Display as="h2" size="md" className="max-w-lg">
          Built for information companies cannot afford to get wrong.
        </Display>
        <div className="mt-4 max-w-sm">
          <ConfidenceRamp />
        </div>
        <div className="mt-12 grid gap-10 md:grid-cols-3">
          <Principle title="Traceable">Every claim links back to its source.</Principle>
          <Principle title="Permissioned">Suppliers control what may be reused.</Principle>
          <Principle title="Auditable">Every change, approval and export is recorded.</Principle>
        </div>
      </section>

      <section className="border-t border-ink/8">
        <div className="mx-auto max-w-6xl px-6 py-28">
          <SourceLabel>The principle</SourceLabel>
          <h2 className="mt-4 max-w-xl font-[family-name:var(--font-space)] text-[40px] font-medium leading-[1.08] tracking-[-0.02em]">
            We never say a claim is true.
            <br />
            We show you how it&apos;s known.
          </h2>
          <p className="mt-6 max-w-lg text-[14.5px] leading-relaxed text-ink/70">
            Start with what you already have. Connect your product and supplier administration.
            SOURCE handles the gaps.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <SourceButton href="/signup">Connect your supply chain →</SourceButton>
            <SourceButton href="/app" variant="ghost">
              Open the demo workspace
            </SourceButton>
          </div>
        </div>
      </section>
    </>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <EvidenceLine />
      <SourceLabel className="mt-4 block">{children}</SourceLabel>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <SourceLabel>{n}</SourceLabel>
      <h3 className="mt-3 font-[family-name:var(--font-space)] text-[20px] tracking-[-0.02em]">
        {title}
      </h3>
      <p className="mt-2 text-[13px] leading-relaxed text-ink/70">{children}</p>
    </div>
  );
}

function Principle({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <EvidenceLine />
      <h3 className="mt-4 font-[family-name:var(--font-space)] text-[20px] tracking-[-0.02em]">
        {title}
      </h3>
      <p className="mt-2 text-[13px] leading-relaxed text-ink/70">{children}</p>
    </div>
  );
}
