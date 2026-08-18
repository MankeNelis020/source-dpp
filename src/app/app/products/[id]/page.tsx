"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import {
  claimsForProduct,
  productById,
  URBAN_CHAIR_COMPONENTS,
  DEMO_EVIDENCE,
} from "@/lib/source/demo-data";
import {
  ClaimCard,
  EvidenceLine,
  Mono,
  SourceButton,
  SourceLabel,
  StatusPill,
} from "@/components/source/ui";
import { useDispatchCommand, useSourceQuery } from "@/client/source/api";

const TABS = ["Overview", "Components", "Claims", "Evidence", "History"] as const;

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const product = productById(params.id);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [openClaim, setOpenClaim] = useState<string | null>(null);
  const [materialName, setMaterialName] = useState("");
  const dispatch = useDispatchCommand();
  const { data: live } = useSourceQuery<{
    id: string;
    name: string;
    children: { id: string; name: string; kind?: string; source?: string; confidence?: number }[];
    blockers: { caseId: string; property: string; actorLabel: string; reason?: string; state: string }[];
  }>(`/api/source/products/${params.id}`);
  if (!product) notFound();
  const claims = claimsForProduct(product.id);
  const selected = claims.find((c) => c.id === openClaim);
  const blockers = live?.blockers ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <SourceLabel>{product.sku}</SourceLabel>
          <h1 className="mt-2 font-[family-name:var(--font-space)] text-[33px] font-medium tracking-[-0.02em]">
            {product.name}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusPill tone={product.status === "ready" ? "signal" : "attention"}>
              {product.status}
            </StatusPill>
            <Mono className="text-[12px] text-[#101A15]/55">READY {product.evidence}%</Mono>
          </div>
        </div>
        <SourceButton href={blockers.length ? "/app/missing" : "/app/requests/new"}>
          {blockers.length ? `Resolve ${blockers.length} blockers` : "Request missing data"}
        </SourceButton>
      </div>

      {blockers.length ? (
        <section className="mt-8 border border-[#101A15]/10 bg-[#FBFCFA] p-5">
          <SourceLabel>What blocks this product?</SourceLabel>
          <ul className="mt-3 space-y-2">
            {blockers.map((blocker) => (
              <li key={blocker.caseId} className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
                <span>
                  {blocker.property}
                  <span className="text-[#101A15]/55"> · {blocker.actorLabel}</span>
                </span>
                <Link href={`/app/missing/${blocker.caseId}`} className="text-[#101A15]/70 hover:underline">
                  {(blocker.reason ?? blocker.state).replaceAll("_", " ")}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 flex gap-4 border-b border-[#101A15]/10">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`pb-2 text-[13px] ${tab === item ? "border-b-2 border-[#0B6E50] text-[#101A15]" : "text-[#101A15]/50"}`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_280px]">
        <div>
          {tab === "Overview" || tab === "Components" ? (
            <div className="font-[family-name:var(--font-plex)] text-[13px] leading-8">
              <div>{product.name}</div>
              {(live?.children?.length
                ? live.children.map((c) => ({ id: c.id, name: c.name, status: "ready" as const, label: c.source ?? c.kind ?? "" }))
                : product.id === "urban-chair-04"
                  ? URBAN_CHAIR_COMPONENTS
                  : URBAN_CHAIR_COMPONENTS.slice(0, 2)
              ).map((c) => (
                <div key={c.id} className="border-l border-[#101A15]/12 pl-4">
                  ├── {c.name}{" "}
                  <StatusPill tone={"status" in c && c.status === "missing" ? "attention" : "teal"}>
                    {"label" in c ? c.label : ""}
                  </StatusPill>
                </div>
              ))}
              <form
                className="mt-6 space-y-2 border border-[#101A15]/10 bg-[#FBFCFA] p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!materialName.trim()) return;
                  void dispatch({
                    type: "ADD_SUBJECT",
                    kind: "MATERIAL",
                    name: materialName.trim(),
                    parentSubjectId: product.id,
                    source: "USER_ADDED",
                    generateRequirements: true,
                  }).then(() => setMaterialName(""));
                }}
              >
                <SourceLabel>Add component or material</SourceLabel>
                <input
                  className="mt-2 w-full border border-[#101A15]/15 px-3 py-2 text-[13px]"
                  placeholder="Stainless Steel 304"
                  value={materialName}
                  onChange={(e) => setMaterialName(e.target.value)}
                />
                <p className="text-[12px] text-[#101A15]/55">This will create new information requirements. SOURCE takes over from there.</p>
                <SourceButton type="submit">Add & resolve</SourceButton>
              </form>
            </div>
          ) : null}

          {tab === "Claims" ? (
            <div className="space-y-3">
              {claims.map((claim) => (
                <button
                  key={claim.id}
                  type="button"
                  className="block w-full text-left"
                  onClick={() => setOpenClaim(claim.id)}
                >
                  <ClaimCard
                    value={claim.value ? `${claim.value}${claim.unit ?? ""}` : "—"}
                    property={claim.property}
                    subject={claim.subject}
                    issuer={claim.declaredBy}
                    valid={claim.validUntil || "—"}
                    reuse={claim.permission}
                    verified={claim.ready}
                    identity={`${claim.identityConfidence}%`}
                  />
                </button>
              ))}
            </div>
          ) : null}

          {tab === "Evidence" ? (
            <ul className="space-y-2 text-[13px]">
              {DEMO_EVIDENCE.filter((e) =>
                claims.some((c) => c.evidenceId === e.id)
              ).map((e) => (
                <li key={e.id}>
                  <a className="hover:underline" href={`/app/evidence/${e.id}`}>
                    {e.filename}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}

          {tab === "History" ? (
            <ul className="space-y-2 font-[family-name:var(--font-plex)] text-[12px] text-[#101A15]/70">
              <li>12 Aug · Catalogue sync from products.xlsx</li>
              <li>14 Aug · Identity matched to Acme Manufacturing B.V.</li>
              <li>15 Aug · Claim recycled_content extracted from cert-92831.pdf</li>
            </ul>
          ) : null}
        </div>

        <aside className="space-y-4 border border-[#101A15]/10 bg-[#FBFCFA] p-5">
          {selected ? (
            <>
              <SourceLabel>Claim</SourceLabel>
              <div className="font-[family-name:var(--font-space)] text-[28px]">
                {selected.value}
                {selected.unit}
              </div>
              <EvidenceLine />
              <Meta k="Subject" v={selected.subject} />
              <Meta k="Declared by" v={selected.declaredBy} />
              <Meta k="Evidence" v={selected.evidenceId ?? "—"} />
              <Meta k="Valid until" v={selected.validUntil || "—"} />
              <Meta k="Identity confidence" v={`${selected.identityConfidence}%`} />
              <Meta k="Evidence status" v={selected.evidenceStatus} />
              <Meta k="Reuse permission" v={selected.permission} />
              <Meta k="Purpose" v={selected.purpose} />
              <div className="flex flex-col gap-2 pt-2">
                <SourceButton href={selected.evidenceId ? `/app/evidence/${selected.evidenceId}` : "/app/evidence"} variant="ghost">
                  View evidence
                </SourceButton>
                <SourceButton variant="ghost">Request reverification</SourceButton>
              </div>
            </>
          ) : (
            <>
              <SourceLabel>Product</SourceLabel>
              <Meta k="Manufacturer" v="Acme Manufacturing B.V." />
              <Meta k="SKU" v={product.sku} />
              <Meta k="GTIN" v={product.gtin ?? "—"} />
              <Meta k="Dataset" v="ESPR - Aluminium v2027" />
              <Meta k="Evidence coverage" v={`${product.evidence}%`} />
              <Meta k="Last updated" v="15 Aug 2026" />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <SourceLabel>{k}</SourceLabel>
      <div className="mt-1 font-[family-name:var(--font-plex)] text-[12px]">{v}</div>
    </div>
  );
}
