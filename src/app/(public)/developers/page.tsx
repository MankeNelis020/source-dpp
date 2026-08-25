import type { Metadata } from "next";
import { EvidenceLine, Mono, SourceLinkButton } from "@/components/source/ui";
import { PageHero, Section, SectionHeader } from "@/components/source/knowledge";
import { SourceJsonLd } from "@/components/source/source-json-ld";
import { PRIMARY_CTA } from "@/lib/source/copy";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata("/developers");

const CURRENT = [
  "File import of product identity, claim values, and existing evidence.",
  "File export of readiness, unresolved reasons, and the evidence trail.",
  "Spreadsheet and catalogue extracts as the default interchange.",
];

const TARGETS = [
  "/v1/actors",
  "/v1/products",
  "/v1/relationships",
  "/v1/claims",
  "/v1/evidence",
  "/v1/permissions",
  "/v1/requests",
];

const HOOKS = [
  "claim.updated",
  "evidence.expiring",
  "request.completed",
  "permission.granted",
  "identity.resolved",
];

export default function DevelopersPage() {
  return (
    <>
      <SourceJsonLd path="/developers" />
      <article>
        <PageHero
          kicker="Developers"
          title="Complementary integrations. Availability is confirmed per assessment."
          lead="SOURCE is designed to sit beside ERP, PIM, PLM, and DPP platforms — not to replace them. File import and export are the current public capabilities. APIs, webhooks, and named connectors are targets whose availability must be confirmed."
        >
          <SourceLinkButton href={PRIMARY_CTA.href}>{PRIMARY_CTA.label}</SourceLinkButton>
        </PageHero>

        <Section>
          <SectionHeader
            kicker="Current"
            title="Files in, files out."
            lead="The discovery workspace demonstrates import of catalogue extracts and export of the evidence trail. That is what can be discussed as available without a scoped assessment."
          />
          <ul className="mt-8 space-y-3">
            {CURRENT.map((line) => (
              <li key={line} className="border border-ink/8 bg-card p-4 text-[13px] leading-relaxed text-ink">
                {line}
              </li>
            ))}
          </ul>
        </Section>

        <Section className="bg-paper">
          <SectionHeader
            kicker="Targets"
            title="Versioned API and webhooks, if they are in scope."
            lead="The shapes below describe the intended integration surface. They are not a general-availability announcement. Confirm each endpoint, webhook, and named connector during assessment."
          />
          <div className="mt-10 grid gap-10 md:grid-cols-2">
            <div>
              <EvidenceLine />
              <h3 className="mt-4 font-[family-name:var(--font-space)] text-[20px] tracking-[-0.02em]">
                Intended resources
              </h3>
              <ul className="mt-4 space-y-1">
                {TARGETS.map((path) => (
                  <li key={path}>
                    <Mono className="text-[13px]">{path}</Mono>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <EvidenceLine />
              <h3 className="mt-4 font-[family-name:var(--font-space)] text-[20px] tracking-[-0.02em]">
                Intended events
              </h3>
              <ul className="mt-4 space-y-1">
                {HOOKS.map((path) => (
                  <li key={path}>
                    <Mono className="text-[13px]">{path}</Mono>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <pre className="mt-12 overflow-x-auto border border-ink/8 bg-card p-5 font-[family-name:var(--font-plex)] text-[12px] leading-relaxed text-ink/80">
{`{
  "claim_id": "clm_9f3a",
  "subject_id": "AL-FRAME-881",
  "property": "recycled_content",
  "value": 67,
  "unit": "%",
  "identity_status": "reconciled",
  "readiness": "UNRESOLVED",
  "unresolved_reason": "permission_denied",
  "reuse_permission": "denied"
}`}
          </pre>
        </Section>
      </article>
    </>
  );
}
