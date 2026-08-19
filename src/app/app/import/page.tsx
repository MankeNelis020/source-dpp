"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EvidenceLine, Metric, SourceButton, SourceLabel } from "@/components/source/ui";
import { api, uploadSourceFile } from "@/client/source/api";

const STAGE_COPY: Record<string, string> = {
  UPLOADED: "We're getting to know your products.",
  PARSING: "Reading your catalogue",
  NORMALIZING: "Connecting products to suppliers",
  IDENTITY_RESOLUTION: "Resolving duplicate identities",
  RELATIONSHIP_BUILDING: "Connecting products to suppliers",
  MATERIAL_DETECTION: "Looking for materials in the BOM",
  EVIDENCE_MATCHING: "Looking for evidence you already have",
  REQUIREMENT_GENERATION: "Finding the real gaps",
  RESOLUTION_PLANNING: "Preparing resolution cases",
  COMPLETE: "Your catalogue is ready.",
  PARTIAL: "Your catalogue is connected, with a few records to review.",
  FAILED: "We kept your file. Review the errors and retry processing.",
};

interface ImportJob {
  id: string;
  state: string;
  currentStage?: string;
  processedCount: number;
  totalCount: number;
  warningCount: number;
  errorCount: number;
  reviewCount: number;
  startedAt?: string;
  sourceFiles?: Record<string, { filename: string; sizeBytes: number }>;
  summary?: {
    products: number;
    suppliers: number;
    relationships: number;
    productSupplierRelationships?: number;
    requirements: number;
    autoResolvable: number;
    supplierAction?: number;
    userAction?: number;
    reviewOrBlocked?: number;
    needsAttention: number;
    sourceHasExecutablePlan?: boolean;
  };
}

export default function ImportWizardPage() {
  const router = useRouter();
  const [productFile, setProductFile] = useState<File | null>(null);
  const [supplierFile, setSupplierFile] = useState<File | null>(null);
  const [bomFile, setBomFile] = useState<File | null>(null);
  const [materialsFile, setMaterialsFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [events, setEvents] = useState<{ type: string; payload: Record<string, string | number | boolean | null> }[]>([]);
  const [history, setHistory] = useState<ImportJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ jobs: ImportJob[] }>("/api/imports")
      .then((data) => setHistory(data.jobs))
      .catch(() => undefined);
  }, [job]);

  async function start() {
    if (!productFile || busy) return;
    setBusy(true);
    setError(null);
    try {
      setStatus("Uploading catalogue…");
      const products = await uploadSourceFile({ purpose: "IMPORT_SOURCE", file: productFile });
      const suppliers = supplierFile
        ? await uploadSourceFile({ purpose: "IMPORT_SOURCE", file: supplierFile })
        : undefined;
      const bom = bomFile ? await uploadSourceFile({ purpose: "IMPORT_SOURCE", file: bomFile }) : undefined;
      const materials = materialsFile
        ? await uploadSourceFile({ purpose: "IMPORT_SOURCE", file: materialsFile })
        : undefined;
      setStatus("Processing…");
      const created = await api<ImportJob>("/api/imports", {
        method: "POST",
        body: JSON.stringify({
          storageObjectIds: {
            products: products.id,
            suppliers: suppliers?.id,
            bom: bom?.id,
            materials: materials?.id,
          },
        }),
      });
      setJob(created);
      const progress = await api<{ job: ImportJob; events: typeof events; percent: number }>(`/api/imports/${created.id}`);
      setJob(progress.job);
      setEvents(progress.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't store this file. Nothing has been added yet.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  const percent = job?.totalCount ? Math.round((job.processedCount / job.totalCount) * 100) : 0;
  const done = job && (job.state === "COMPLETE" || job.state === "PARTIAL" || job.state === "FAILED");

  return (
    <div className="mx-auto max-w-2xl">
      <SourceLabel>Import</SourceLabel>
      <h1 className="mt-2 font-[family-name:var(--font-space)] text-[33px] font-medium tracking-[-0.02em]">
        {job ? STAGE_COPY[job.state] ?? job.state : "Connect your catalogue"}
      </h1>
      {job ? (
        <p className="mt-2 text-[13px] text-[#101A15]/60">
          Import {job.state === "COMPLETE" || job.state === "PARTIAL" ? "finished" : "running"} · {percent}%
        </p>
      ) : (
        <p className="mt-2 text-[13px] text-[#101A15]/60">Choose CSV files. SOURCE stores the original privately, then processes it.</p>
      )}

      {!job ? (
        <>
          <div className="mt-8 grid gap-4 text-[13px]">
            <FileField label="Products.csv" accept=".csv,text/csv" onFile={setProductFile} file={productFile} />
            <FileField label="Suppliers.csv (optional)" accept=".csv,text/csv" onFile={setSupplierFile} file={supplierFile} />
            <FileField label="BOM.csv (optional)" accept=".csv,text/csv" onFile={setBomFile} file={bomFile} />
            <FileField label="Materials.csv (optional)" accept=".csv,text/csv" onFile={setMaterialsFile} file={materialsFile} />
          </div>
          {status ? <p className="mt-4 text-[13px] text-[#101A15]/65">{status}</p> : null}
          {error ? <p className="mt-4 text-[13px] text-[#B26B2C]">{error}</p> : null}
          <SourceButton className="mt-6" onClick={() => void start()} disabled={busy || !productFile}>
            Start import
          </SourceButton>
        </>
      ) : null}

      {job && !done ? (
        <div className="mt-8">
          <EvidenceLine />
          <p className="mt-4 text-[14.5px]">{STAGE_COPY[job.currentStage ?? job.state]}</p>
        </div>
      ) : null}

      {job?.summary ? (
        <div className="mt-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Metric value={String(job.summary.products)} label="Products found" />
            <Metric value={String(job.summary.suppliers)} label="Suppliers identified" />
            <Metric value={String(job.summary.productSupplierRelationships ?? 0)} label="Product–supplier relationships" />
            <Metric value={String(job.summary.relationships)} label="Component relationships" />
          </div>
          <ul className="mt-6 space-y-1 font-[family-name:var(--font-plex)] text-[12px] text-[#101A15]/65">
            {events
              .filter((e) => e.type === "entity.detected" || e.type === "relationship.created" || e.type === "entity.matched")
              .map((event, i) => (
                <li key={i}>
                  {event.type.replace(".", " ")} · {JSON.stringify(event.payload)}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {done && job.summary ? (
        <div className="mt-10 border border-[#101A15]/10 bg-[#FBFCFA] p-6">
          <h2 className="font-[family-name:var(--font-space)] text-[22px]">Your catalogue is connected.</h2>
          <p className="mt-3 text-[14.5px] leading-relaxed">
            {job.summary.products} products · {job.summary.suppliers} suppliers ·{" "}
            {job.summary.productSupplierRelationships ?? 0} product–supplier relationships · {job.summary.relationships}{" "}
            component relationships
          </p>
          <p className="mt-4 text-[14.5px]">
            SOURCE found {job.summary.requirements} missing information requirements. We can handle{" "}
            {job.summary.autoResolvable} automatically. {job.summary.supplierAction ?? 0} need supplier input.{" "}
            {job.summary.userAction ?? 0} need your attention. {job.summary.reviewOrBlocked ?? 0} need review.
          </p>
          {job.summary.requirements >
          job.summary.autoResolvable +
            (job.summary.supplierAction ?? 0) +
            (job.summary.userAction ?? 0) +
            (job.summary.reviewOrBlocked ?? 0) ? (
            <p className="mt-3 text-[13px] text-[#B26B2C]">
              Some missing requirements were not classified. SOURCE will not treat them as complete.
            </p>
          ) : null}
          {job.errorCount ? (
            <p className="mt-3 text-[13px] text-[#B26B2C]">
              {job.errorCount} could not be imported. {job.reviewCount} need review. The original file is kept.
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-2">
            {job.summary.sourceHasExecutablePlan !== false &&
            job.summary.autoResolvable + (job.summary.supplierAction ?? 0) > 0 ? (
              <SourceButton
                onClick={() =>
                  void api<{ emailsQueued?: number }>("/api/source/resolution-run", { method: "POST", body: "{}" }).then((result) => {
                    setStatus(
                      result.emailsQueued
                        ? "Request queued. SOURCE will email suppliers shortly."
                        : "SOURCE is working the gaps. No new supplier email was needed."
                    );
                    router.push("/app/pilot");
                  })
                }
              >
                Let SOURCE handle the gaps
              </SourceButton>
            ) : (
              <p className="text-[13px] text-[#101A15]/70">
                SOURCE has no executable resolution plan yet. Identify a supplier or a contact so these requirements can move.
              </p>
            )}
            <SourceButton href="/app/reviews" variant="ghost">
              Review {job.reviewCount || job.summary.needsAttention}
            </SourceButton>
          </div>
        </div>
      ) : null}

      {history.length ? (
        <div className="mt-12">
          <SourceLabel>Import history</SourceLabel>
          <ul className="mt-3 space-y-2 text-[13px]">
            {history.map((item) => (
              <li key={item.id} className="border border-[#101A15]/10 px-3 py-2">
                <div>{item.sourceFiles?.products?.filename ?? item.id}</div>
                <div className="text-[12px] text-[#101A15]/55">
                  {item.startedAt ? new Date(item.startedAt).toLocaleString() : ""} · {item.state.toLowerCase()}
                  {item.sourceFiles?.products?.sizeBytes ? ` · ${item.sourceFiles.products.sizeBytes} bytes` : ""}
                  {item.summary ? ` · ${item.summary.products} products` : ""}
                  {item.errorCount ? ` · ${item.errorCount} errors` : ""}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function FileField(props: { label: string; accept: string; file: File | null; onFile: (file: File | null) => void }) {
  return (
    <label>
      {props.label}
      <input
        className="mt-1 block w-full text-[12px]"
        type="file"
        accept={props.accept}
        onChange={(event) => props.onFile(event.target.files?.[0] ?? null)}
      />
      {props.file ? (
        <span className="mt-1 block font-[family-name:var(--font-plex)] text-[12px] text-[#101A15]/60">
          {props.file.name} · {props.file.size} bytes
        </span>
      ) : null}
    </label>
  );
}
