import { DEMO_CLAIMS } from "@/lib/source/demo-data";
import { PageHeader } from "@/components/source/page-header";
import { ClaimCard } from "@/components/source/ui";

export default function ClaimsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Claims"
        description="A claim is never overwritten. New information becomes a new version. Status, not truth."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {DEMO_CLAIMS.map((claim) => (
          <ClaimCard
            key={claim.id}
            value={claim.value ? `${claim.value}${claim.unit ?? ""}` : "—"}
            property={claim.property}
            subject={claim.subject}
            issuer={claim.declaredBy}
            valid={claim.validUntil || "—"}
            reuse={claim.permission}
            verified={claim.ready}
            identity={`${claim.identityConfidence}%`}
          />
        ))}
      </div>
    </div>
  );
}
