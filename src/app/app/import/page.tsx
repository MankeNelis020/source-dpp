"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EvidenceLine, Metric, SourceButton, SourceLabel } from "@/components/source/ui";
import { api } from "@/client/source/api";

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
  summary?: {
    products: number;
    suppliers: number;
    relationships: number;
    requirements: number;
    autoResolvable: number;
    needsAttention: number;
  };
}

export default function ImportWizardPage() {
  const router = useRouter();
  const [products, setProducts] = useState(SAMPLE_PRODUCTS);
  const [suppliers, setSuppliers] = useState(SAMPLE_SUPPLIERS);
  const [bom, setBom] = useState(SAMPLE_BOM);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [events, setEvents] = useState<{ type: string; payload: Record<string, string | number | boolean | null> }[]>([]);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const created = await api<ImportJob>("/api/imports", {
        method: "POST",
        body: JSON.stringify({ products, suppliers, bom }),
      });
      setJob(created);
      const progress = await api<{ job: ImportJob; events: typeof events; percent: number }>(`/api/imports/${created.id}`);
      setJob(progress.job);
      setEvents(progress.events);
    } finally {
      setBusy(false);
    }
  }

  const percent = job?.totalCount ? Math.round((job.processedCount / job.totalCount) * 100) : 0;
  const done = job && (job.state === "COMPLETE" || job.state === "PARTIAL");

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
        <p className="mt-2 text-[13px] text-[#101A15]/60">CSV first. You only correct uncertain column mappings.</p>
      )}

      {!job ? (
        <>
          <div className="mt-8 grid gap-4 font-[family-name:var(--font-plex)] text-[12px]">
            <label>
              Products.csv
              <textarea className="mt-1 h-28 w-full border border-[#101A15]/15 bg-[#FBFCFA] p-2" value={products} onChange={(e) => setProducts(e.target.value)} />
            </label>
            <label>
              Suppliers.csv
              <textarea className="mt-1 h-24 w-full border border-[#101A15]/15 bg-[#FBFCFA] p-2" value={suppliers} onChange={(e) => setSuppliers(e.target.value)} />
            </label>
            <label>
              BOM.csv
              <textarea className="mt-1 h-24 w-full border border-[#101A15]/15 bg-[#FBFCFA] p-2" value={bom} onChange={(e) => setBom(e.target.value)} />
            </label>
          </div>
          <SourceButton className="mt-6" onClick={() => void start()} disabled={busy}>
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
          <div className="grid gap-6 sm:grid-cols-3">
            <Metric value={String(job.summary.products)} label="Products found" />
            <Metric value={String(job.summary.suppliers)} label="Suppliers identified" />
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
            {job.summary.products} products · {job.summary.suppliers} suppliers · {job.summary.relationships} relationships
          </p>
          <p className="mt-4 text-[14.5px]">
            SOURCE found {job.summary.requirements} missing information requirements. We can handle {job.summary.autoResolvable} automatically. {job.summary.needsAttention} need your attention or supplier input.
          </p>
          {job.errorCount ? (
            <p className="mt-3 text-[13px] text-[#B26B2C]">
              {job.errorCount} could not be imported. {job.reviewCount} need review. Continue without them, or correct the rows.
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-2">
            <SourceButton
              onClick={() =>
                void api("/api/source/resolution-run", { method: "POST", body: "{}" }).then(() => router.push("/app/pilot"))
              }
            >
              Let SOURCE handle the gaps
            </SourceButton>
            <SourceButton href="/app/reviews" variant="ghost">
              Review {job.reviewCount || job.summary.needsAttention}
            </SourceButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const SAMPLE_PRODUCTS = `external_product_id,name,sku,gtin,manufacturer,supplier_id,manufacturer_part_number
urban-chair-04,Urban Chair 04,URBAN-CHAIR-04,8712345678901,Acme,supplier-a,ALF881
lounge-11,Lounge 11,LOUNGE-11,8712345678902,Acme,supplier-b,LG11
desk-02,Desk 02,DESK-02,8712345678903,Acme,furnco,DK02
`;

const SAMPLE_SUPPLIERS = `external_supplier_id,name,legal_name,vat,country,domain
supplier-a,Supplier A,Supplier A GmbH,DE813334455,Germany,suppliera.example
supplier-b,Supplier B,Supplier B S.r.l.,IT01234567890,Italy,supplierb.example
furnco,FurnCo,FurnCo BV,,Netherlands,furnco.example
`;

const SAMPLE_BOM = `product_id,component_id,component_name,quantity,unit,supplier_id,manufacturer_part_number
urban-chair-04,AL-FRAME-881,Aluminium Frame,1,ea,supplier-a,ALF881
urban-chair-04,TEXTILE-04,Textile,1,ea,supplier-b,
`;
