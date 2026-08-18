"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/source/page-header";
import { SourceLabel, SourceTable, StatusPill, SourceButton } from "@/components/source/ui";
import { uploadSourceFile, useSourceQuery } from "@/client/source/api";

interface EvidenceItem {
  type: string;
  opaqueRef?: string;
  filename?: string;
  issuer?: string;
  status?: string;
  validUntil?: string;
  availability?: string;
  evidenceVisible?: boolean;
}

export default function EvidenceLibraryPage() {
  const { data, error, reload } = useSourceQuery<{ items: EvidenceItem[] }>("/api/source/evidence");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    try {
      setStage("Uploading…");
      await uploadSourceFile({
        purpose: "EVIDENCE",
        file,
        onProgress: (s) => setStage(s === "finalize" ? "Processing…" : s === "upload" ? "Uploading…" : "Starting…"),
      });
      setStage("Uploaded. On file — not verified until SOURCE evaluates the claim.");
      setFile(null);
      reload();
    } catch (err) {
      setStage(err instanceof Error ? err.message : "We couldn't store this file. Nothing has been added yet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Evidence"
        description="Not a Dropbox clone. Evidence is found through claims: original document, SHA hash, issuer, permissions, audit history."
      />
      <div className="mb-8 border border-[#101A15]/10 bg-[#FBFCFA] p-4">
        <SourceLabel>Upload evidence</SourceLabel>
        <p className="mt-1 text-[13px] text-[#101A15]/65">PDF, CSV, PNG or JPEG. Upload is not verification.</p>
        <input className="mt-3 block" type="file" accept=".pdf,.csv,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file ? (
          <p className="mt-2 font-[family-name:var(--font-plex)] text-[12px]">
            {file.name} · {file.size} bytes
          </p>
        ) : null}
        <SourceButton className="mt-3" onClick={() => void upload()} disabled={!file || busy}>
          Upload
        </SourceButton>
        {stage ? <p className="mt-2 text-[13px] text-[#101A15]/70">{stage}</p> : null}
      </div>
      {error ? <p className="text-[13px] text-[#B26B2C]">{error}</p> : null}
      {(data?.items ?? []).length === 0 && !error ? (
        <p className="mb-6 text-[13px] text-[#101A15]/65">No evidence uploaded yet. Files you add here stay private to this organisation.</p>
      ) : null}
      <SourceTable columns={["Document", "Status", "Valid until"]}>
        {(data?.items ?? []).map((e, index) => (
          <tr key={e.opaqueRef ?? String(index)} className="border-t border-[#101A15]/8 hover:bg-[#EFF2ED]/80">
            <td className="px-4 py-3">
              {e.type === "EVIDENCE_RECORD" && e.opaqueRef ? (
                <Link href={`/app/evidence/${e.opaqueRef}`} className="font-[family-name:var(--font-plex)] text-[12px] hover:underline">
                  {e.filename ?? "Evidence"}
                </Link>
              ) : (
                <span className="text-[#101A15]/55">Attestation only</span>
              )}
            </td>
            <td className="px-4 py-3">
              <StatusPill tone={e.status === "expired" ? "attention" : "muted"}>
                {e.availability && e.availability !== "AVAILABLE" ? e.availability.toLowerCase() : e.status ?? "on file"}
              </StatusPill>
            </td>
            <td className="px-4 py-3 font-[family-name:var(--font-plex)] text-[12px]">{e.validUntil ?? "—"}</td>
          </tr>
        ))}
      </SourceTable>
      <p className="mt-3">
        <SourceLabel>Originals are immutable. A new version is a new evidence object. Uploaded is not verified.</SourceLabel>
      </p>
    </div>
  );
}
