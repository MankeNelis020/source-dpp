import type { Metadata } from "next";
import { EvidenceLine, Mono, SourceButton, SourceLabel } from "@/components/source/ui";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata("/developers");

const ENDPOINTS = [
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
    <div className="mx-auto max-w-3xl px-6 py-16 md:py-24">
      <SourceLabel>Developers</SourceLabel>
      <h1 className="mt-4 font-[family-name:var(--font-space)] text-[40px] font-medium leading-[1.08] tracking-[-0.02em]">
        Open integration. No data lock-in.
      </h1>
      <p className="mt-4 text-[14.5px] leading-relaxed text-ink/70">
        Connectors authenticate, discover, pull, normalize, checkpoint and push. They know nothing
        of SOURCE business rules. They deliver canonical source records; identity, claims and
        permissions live above that.
      </p>

      <div className="mt-14">
        <EvidenceLine />
        <h2 className="mt-4 font-[family-name:var(--font-space)] text-[20px]">Versioned API</h2>
        <ul className="mt-4 space-y-1">
          {ENDPOINTS.map((path) => (
            <li key={path}>
              <Mono className="text-[13px]">{path}</Mono>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-12">
        <EvidenceLine />
        <h2 className="mt-4 font-[family-name:var(--font-space)] text-[20px]">Webhooks</h2>
        <ul className="mt-4 space-y-1">
          {HOOKS.map((path) => (
            <li key={path}>
              <Mono className="text-[13px]">{path}</Mono>
            </li>
          ))}
        </ul>
      </div>

      <pre className="mt-12 overflow-x-auto border border-ink/8 bg-card p-5 font-[family-name:var(--font-plex)] text-[12px] leading-relaxed text-ink/80">
{`{
  "claim_id": "clm_9f3a",
  "subject_id": "AL-FRAME-881",
  "property": "recycled_content",
  "value": 67,
  "unit": "%",
  "identity_confidence": 0.997,
  "evidence_status": "verified",
  "reuse_permission": "verified_customers"
}`}
      </pre>

      <div className="mt-10">
        <SourceButton href="/signup">Get API access</SourceButton>
      </div>
    </div>
  );
}
