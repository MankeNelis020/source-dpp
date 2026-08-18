"use client";

import { useParams } from "next/navigation";
import { EvidenceLine, SourceLabel, StatusPill } from "@/components/source/ui";
import { useSourceQuery } from "@/client/source/api";

interface EvidenceAccess {
  type: string;
  filename?: string;
  issuer?: string;
  status?: string;
  validUntil?: string;
  signedUrl?: string;
  evidenceVisible?: boolean;
}

export default function EvidenceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data, error } = useSourceQuery<EvidenceAccess>(id ? `/api/source/evidence/${encodeURIComponent(id)}` : null);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="mt-2 font-[family-name:var(--font-space)] text-[28px]">Resource unavailable.</h1>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SourceLabel>Evidence object</SourceLabel>
      <h1 className="mt-2 font-[family-name:var(--font-space)] text-[28px] tracking-[-0.02em]">
        {data?.type === "EVIDENCE_ATTESTATION" ? "Evidence attestation" : data?.filename ?? "Evidence"}
      </h1>
      <EvidenceLine />
      {data?.type === "EVIDENCE_ATTESTATION" ? (
        <p className="mt-6 text-[14.5px]">On file. SOURCE does not disclose the original in this view.</p>
      ) : (
        <div className="mt-6 space-y-4 text-[13px]">
          <div>
            <SourceLabel>Status</SourceLabel>
            <div className="mt-1">
              <StatusPill tone="muted">{data?.status ?? "on file"}</StatusPill>
            </div>
          </div>
          <div>
            <SourceLabel>Issuer</SourceLabel>
            <div className="mt-1">{data?.issuer ?? "—"}</div>
          </div>
          <div>
            <SourceLabel>Valid until</SourceLabel>
            <div className="mt-1">{data?.validUntil ?? "—"}</div>
          </div>
          {data?.signedUrl ? (
            <a className="inline-block underline" href={data.signedUrl}>
              Download original (short-lived)
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}
