import type { Metadata } from "next";
import { Check, FileQuestion, Handshake, Search } from "lucide-react";
import { ClaimCard, SourceLinkButton } from "@/components/source/ui";
import { Section, SectionHeader } from "@/components/source/knowledge";
import { SourceJsonLd } from "@/components/source/source-json-ld";
import { HeroGraph } from "@/components/source/hero-graph";
import { IdentityDemo } from "@/components/source/identity-demo";
import {
  EVIDENCE_PRINCIPLES,
  EVIDENCE_STAGES,
  HERO_LINE_1,
  HERO_LINE_2,
  PRIMARY_CTA,
  SUPPLIER_CTA,
} from "@/lib/source/copy";
import { SITE_NAME } from "@/lib/seo/site";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  ...pageMetadata("/"),
  title: {
    absolute: `${SITE_NAME} — ${HERO_LINE_1} ${HERO_LINE_2}`,
  },
};

const STAGE_ICONS = [Search, FileQuestion, Handshake, Check] as const;

export default function HomePage() {
  return (
    <>
      <SourceJsonLd path="/" includeFaq />
      <article>
        <header className="relative overflow-hidden border-b border-ink/8 bg-paper">
          <div className="absolute inset-0 opacity-[0.35]">
            <HeroGraph />
          </div>
          <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:items-center lg:py-24">
            <div>
              <p className="mb-4 font-[family-name:var(--font-plex)] text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">
                Product evidence resolution
              </p>
              <h1 className="max-w-xl font-[family-name:var(--font-space)] text-[38px] font-medium leading-[1.08] tracking-[-0.02em] text-ink sm:text-5xl md:text-[3.35rem]">
                {HERO_LINE_1}
                <br />
                {HERO_LINE_2}
              </h1>
              <p className="mt-6 max-w-xl text-[14.5px] leading-relaxed text-ink/70">
                SOURCE is a lightweight product-evidence resolution layer for European manufacturers.
                It finds evidence gaps, retrieves existing evidence, and prepares targeted supplier
                requests. It does not replace ERP, PIM, PLM, or DPP platforms.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <SourceLinkButton href={PRIMARY_CTA.href} className="justify-center">
                  {PRIMARY_CTA.label}
                </SourceLinkButton>
                <SourceLinkButton
                  href={SUPPLIER_CTA.href}
                  variant="ghost"
                  className="justify-center"
                >
                  {SUPPLIER_CTA.label}
                </SourceLinkButton>
              </div>
            </div>
            <div className="relative hidden min-h-[280px] lg:block">
              <HeroGraph />
            </div>
          </div>
        </header>

        <Section>
          <SectionHeader
            kicker="Audience"
            title="Built for manufacturer teams, not another master-data system."
            lead="Operations, quality, sustainability, and procurement teams use SOURCE beside the systems they already run. Importers and brand owners with European disclosure duties can use the same evidence layer."
          />
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                title: "Manufacturers and importers",
                body: "Keep product identity in ERP, PIM, or PLM. Use SOURCE to see which claims still lack evidence, whose evidence is missing, and which requests are ready to send.",
              },
              {
                title: "Supplier counterparts",
                body: "Receive a scoped request, disclose only what the request asks for, decline with a reason, or mark an answer as uncertain. Delegation and reuse permission stay explicit.",
              },
              {
                title: "Reviewers",
                body: "Inspect recorded evidence, validity windows, permissions, and unresolved outcomes. SOURCE does not independently certify evidence or determine legal sufficiency.",
              },
            ].map((item) => (
              <div key={item.title} className="border border-ink/8 bg-card p-5">
                <h3 className="font-[family-name:var(--font-space)] text-base tracking-[-0.02em] text-ink">
                  {item.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink/70">{item.body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section className="bg-paper">
          <SectionHeader
            kicker="Category boundary"
            title="A support layer on product evidence, not a replacement stack."
            lead="SOURCE sits next to catalogues, passports, and supplier systems. It records what is known, what is missing, and what remains unresolved."
          />
          <div className="mt-10 grid gap-px overflow-hidden border border-ink/8 bg-ink/8 md:grid-cols-2">
            <div className="bg-card p-6">
              <p className="font-[family-name:var(--font-plex)] text-[11px] font-medium uppercase tracking-[0.14em] text-ink/55">
                SOURCE does
              </p>
              <ul className="mt-4 space-y-2 text-[13px] text-ink">
                <li>Find evidence gaps against the claims a manufacturer already stores.</li>
                <li>Retrieve existing evidence when identity, scope, validity, and permission allow reuse.</li>
                <li>Prepare targeted requests for a responsible supplier or internal owner.</li>
                <li>Keep unresolved, declined, and uncertain outcomes visible.</li>
              </ul>
            </div>
            <div className="bg-card p-6">
              <p className="font-[family-name:var(--font-plex)] text-[11px] font-medium uppercase tracking-[0.14em] text-ink/55">
                SOURCE does not
              </p>
              <ul className="mt-4 space-y-2 text-[13px] text-ink">
                <li>Replace ERP, PIM, PLM, or DPP publication platforms.</li>
                <li>Publish Digital Product Passports or create QR codes and data carriers.</li>
                <li>Guarantee supplier response, compliance, or legal sufficiency.</li>
                <li>Become another system of record for product master data.</li>
              </ul>
            </div>
          </div>
        </Section>

        <Section>
          <SectionHeader
            kicker="Evidence-resolution workflow"
            title="Four stages from gap to recorded outcome."
            lead="The public illustration below is a manufacturer journey, not a live customer portfolio."
          />
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {EVIDENCE_STAGES.map((stage, i) => {
              const Icon = STAGE_ICONS[i] ?? Search;
              return (
                <li key={stage.title} className="border border-ink/8 bg-card p-5">
                  <p className="font-[family-name:var(--font-plex)] text-[11px] font-medium uppercase tracking-[0.14em] text-ink/55">
                    0{i + 1}
                  </p>
                  <Icon className="mt-3 h-4 w-4 text-ink" strokeWidth={1.5} />
                  <h3 className="mt-3 font-[family-name:var(--font-space)] text-base tracking-[-0.02em] text-ink">
                    {stage.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink/70">{stage.body}</p>
                </li>
              );
            })}
          </ol>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <IdentityDemo />
            <ClaimCard
              issuer="Nordform Metals GmbH"
              reuse="allowed · recorded permission"
              verified
            />
          </div>
        </Section>

        <Section className="bg-paper">
          <SectionHeader
            kicker="Supplier proposition"
            title="Scoped disclosure, not guaranteed response performance."
            lead="A supplier request in SOURCE is a controlled ask. It can be answered, declined, delegated, marked uncertain, or left unresolved."
          />
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              "Requests name the product identity, the claim, and the evidence sought — not an open dump of supplier files.",
              "Delegation is recorded. A downstream mill or recycler can become the responding party without hiding the chain.",
              "Uncertainty is a valid outcome. SOURCE does not convert a missing answer into implied coverage.",
              "Declined requests, permission denials, and no-response outcomes stay visible to the manufacturer.",
            ].map((line) => (
              <li key={line} className="border border-ink/8 bg-card p-4 text-[13px] leading-relaxed text-ink">
                {line}
              </li>
            ))}
          </ul>
          <SourceLinkButton href="/suppliers" variant="ghost" className="mt-8">
            Supplier experience
          </SourceLinkButton>
        </Section>

        <Section>
          <SectionHeader
            kicker="Evidence principles"
            title="Six rules that keep a value from being treated as proof."
            lead="A recorded number is not ready for reuse until identity, scope, permission, and validity are also recorded — and conflicts or unresolved outcomes remain visible."
          />
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {EVIDENCE_PRINCIPLES.map((principle) => (
              <div key={principle.title} className="border border-ink/8 bg-card px-5 py-4">
                <h3 className="text-sm font-medium text-ink">{principle.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink/70">{principle.body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section className="bg-paper">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="font-[family-name:var(--font-plex)] text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">
                Support-layer metaphor
              </p>
              <h2 className="mt-3 max-w-2xl font-[family-name:var(--font-space)] text-[28px] font-medium tracking-[-0.02em] text-ink md:text-[33px]">
                SOURCE is the evidence desk beside the systems you already run.
              </h2>
              <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-ink/70">
                Catalogues stay in PIM. Engineering stays in PLM. Passports, when you publish them,
                stay in a DPP platform. SOURCE holds the evidence trail those systems cannot resolve
                on their own — including the cases that do not resolve.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <SourceLinkButton href={PRIMARY_CTA.href} className="justify-center">
                {PRIMARY_CTA.label}
              </SourceLinkButton>
              <SourceLinkButton href="/product" variant="ghost" className="justify-center">
                Readiness gates
              </SourceLinkButton>
            </div>
          </div>
        </Section>
      </article>
    </>
  );
}
