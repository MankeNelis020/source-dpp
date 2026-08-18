"use client";

import { PageHeader } from "@/components/source/page-header";
import { ClaimCard, EmptyState, SourceButton } from "@/components/source/ui";
import { useSourceQuery } from "@/client/source/api";

interface ClaimRow {
  id: string;
  property: string;
  value: string;
  unit?: string;
  subject: string;
  declaredBy: string;
  ready: boolean;
  permissionState: string;
  validUntil?: string;
  identityConfidence: number;
}

export default function ClaimsPage() {
  const { data, loading } = useSourceQuery<{ claims: ClaimRow[] }>("/api/source/claims");
  const claims = data?.claims ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Claims"
        description="A claim is never overwritten. New information becomes a new version. Status, not truth."
      />
      {!loading && claims.length === 0 ? (
        <EmptyState
          title="No claims yet"
          description="Claims appear after SOURCE resolves missing information from existing evidence or a supplier response."
          action={<SourceButton href="/app/import">Upload catalogue</SourceButton>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {claims.map((claim) => (
            <ClaimCard
              key={claim.id}
              value={claim.value ? `${claim.value}${claim.unit ?? ""}` : "—"}
              property={claim.property}
              subject={claim.subject}
              issuer={claim.declaredBy}
              valid={claim.validUntil || "—"}
              reuse={claim.permissionState.replaceAll("_", " ").toLowerCase()}
              verified={claim.ready}
              identity={`${Math.round(claim.identityConfidence)}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
