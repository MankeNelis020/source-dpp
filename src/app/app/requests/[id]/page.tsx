import { notFound } from "next/navigation";
import { requestById } from "@/lib/source/demo-data";
import { SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = requestById(id);
  if (!request) notFound();
  const pct = Math.round((request.complete / request.claimsRequested) * 100);

  return (
    <div className="mx-auto max-w-3xl">
      <SourceLabel>Request</SourceLabel>
      <h1 className="mt-2 font-[family-name:var(--font-space)] text-[33px] font-medium tracking-[-0.02em]">
        {request.supplierName}
      </h1>
      <p className="mt-2 text-[13px] text-[#101A15]/65">
        Requested {request.sent} · Due {request.due}
      </p>
      <div className="mt-3">
        <StatusPill tone={request.status === "overdue" ? "attention" : "teal"}>
          {request.status.replace("_", " ")}
        </StatusPill>
      </div>
      <div className="mt-8">
        <SourceLabel>Progress</SourceLabel>
        <div className="mt-2 font-[family-name:var(--font-plex)] text-[22px]">
          {request.complete} / {request.claimsRequested} complete
        </div>
        <div className="mt-3 h-1.5 bg-[#101A15]/8">
          <div className="h-full bg-[#0B6E50]" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ol className="mt-10 space-y-3">
        {request.timeline.map((item) => (
          <li key={item.date + item.event} className="flex gap-4 text-[13px]">
            <span className="w-16 font-[family-name:var(--font-plex)] text-[12px] text-[#101A15]/50">
              {item.date}
            </span>
            <span>{item.event}</span>
          </li>
        ))}
      </ol>
      <div className="mt-10 flex flex-wrap gap-2">
        <SourceButton variant="ghost">Send reminder</SourceButton>
        <SourceButton variant="ghost">Extend deadline</SourceButton>
        <SourceButton href="/s/demo" variant="ghost">
          Open supplier view
        </SourceButton>
      </div>
    </div>
  );
}
