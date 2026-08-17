import { notFound } from "next/navigation";
import { supplierById } from "@/lib/source/demo-data";
import { Metric, SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supplier = supplierById(id);
  if (!supplier) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <SourceLabel>Supplier</SourceLabel>
      <h1 className="mt-2 font-[family-name:var(--font-space)] text-[33px] font-medium tracking-[-0.02em]">
        {supplier.name}
      </h1>
      <p className="mt-2 text-[13px] text-[#101A15]/65">
        Matched to {supplier.legalName} · Identity confidence {supplier.identityConfidence}%
      </p>
      <div className="mt-3">
        <StatusPill tone={supplier.status === "attention" ? "attention" : "signal"}>
          {supplier.status}
        </StatusPill>
      </div>
      <div className="mt-10 grid gap-8 sm:grid-cols-4">
        <Metric value={String(supplier.products)} label="Products supplied" />
        <Metric value={`${supplier.evidence}%`} label="Evidence coverage" />
        <Metric value={String(supplier.missing)} label="Missing claims" />
        <Metric value="6" label="Evidence items expiring" />
      </div>
      <p className="mt-8 max-w-xl text-[13px] text-[#101A15]/70">
        {supplier.name} has {supplier.missing} missing claims across 18 product families. SOURCE
        will request the gaps in one collection — not {supplier.products} individual mails.
      </p>
      <div className="mt-8">
        <SourceButton href="/app/requests/new">Request missing information</SourceButton>
      </div>
    </div>
  );
}
