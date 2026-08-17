import { notFound } from "next/navigation";
import { evidenceById, DEMO_CLAIMS, DEMO_SUPPLIERS } from "@/lib/source/demo-data";
import { EvidenceLine, Mono, SourceLabel, StatusPill } from "@/components/source/ui";

export default async function EvidenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = evidenceById(id);
  if (!item) notFound();
  const supplier = DEMO_SUPPLIERS.find((s) => s.id === item.supplierId);
  const claims = DEMO_CLAIMS.filter((c) => item.linkedClaims.includes(c.id));

  return (
    <div className="mx-auto max-w-3xl">
      <SourceLabel>Evidence object</SourceLabel>
      <h1 className="mt-2 font-[family-name:var(--font-space)] text-[28px] tracking-[-0.02em]">
        {item.filename}
      </h1>
      <EvidenceLine />
      <div className="mt-6 space-y-4">
        <Row k="SHA-256" v={item.sha256} />
        <Row k="Issuer" v={item.issuer} />
        <Row k="Owner" v={supplier?.legalName ?? "—"} />
        <Row k="Valid until" v={item.validUntil} />
        <Row k="MIME" v="application/pdf" />
        <div>
          <SourceLabel>Verification</SourceLabel>
          <div className="mt-1">
            <StatusPill tone={item.verification === "verified" ? "signal" : "attention"}>
              {item.verification}
            </StatusPill>
          </div>
        </div>
        <div>
          <SourceLabel>Linked claims</SourceLabel>
          <ul className="mt-2 space-y-1 text-[13px]">
            {claims.length === 0 ? <li className="text-ink/50">None yet</li> : null}
            {claims.map((c) => (
              <li key={c.id}>
                {c.property} · {c.value}
                {c.unit} · {c.subject}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <SourceLabel>{k}</SourceLabel>
      <div className="mt-1">
        <Mono className="break-all text-[12px]">{v}</Mono>
      </div>
    </div>
  );
}
