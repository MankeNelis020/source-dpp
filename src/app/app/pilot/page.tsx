"use client";

import { PageHeader } from "@/components/source/page-header";
import { Metric, SourceButton } from "@/components/source/ui";
import { useSourceQuery } from "@/client/source/api";

export default function PilotResultsPage() {
  const { data } = useSourceQuery<{
    run: { baseline: { missing: number; alreadyReady: number; totalRequirements: number; totalProducts: number } } | null;
    evaluation: {
      initialMissing: number;
      resolvedWithoutOutreach: number;
      resolvedSupplierResponse: number;
      resolvedHuman: number;
      stillResolving: number;
      unresolved: number;
      supplierContactsAvoided: number;
      uniqueSuppliersContacted: number;
      productsUnblocked: number;
      humanReviewActions: number;
      contactAvoidanceRate: number;
      propagationMultiplier: number;
    } | null;
    sentences: string[];
  }>("/api/source/pilot");

  const evaluation = data?.evaluation;
  const baseline = data?.run?.baseline;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Resolution results"
        description="Numbers come from the frozen pilot cohort and persisted outcomes. SOURCE does not declare success from a single percentage."
      />
      {!evaluation || !baseline ? (
        <p className="text-[14px] text-[#101A15]/65">
          Import a catalogue to start a pilot run.{" "}
          <SourceButton href="/app/import" variant="ghost">
            Connect catalogue
          </SourceButton>
        </p>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2">
            <Metric value={String(evaluation.initialMissing)} label="Initial missing requirements" />
            <Metric value={String(evaluation.resolvedWithoutOutreach)} label="Resolved without new outreach" />
            <Metric value={String(evaluation.resolvedSupplierResponse)} label="Resolved after supplier response" />
            <Metric value={String(evaluation.resolvedHuman)} label="Human-entered" />
            <Metric value={String(evaluation.stillResolving)} label="Still resolving" />
            <Metric value={String(evaluation.unresolved)} label="Unresolved" />
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Metric value={String(evaluation.supplierContactsAvoided)} label="Supplier contacts avoided" />
            <Metric value={String(evaluation.uniqueSuppliersContacted)} label="Unique suppliers contacted" />
            <Metric value={String(evaluation.productsUnblocked)} label="Products unblocked" />
            <Metric value={String(evaluation.humanReviewActions)} label="Human review actions" />
          </div>
          <p className="mt-8 text-[13px] text-[#101A15]/55">
            Contact avoidance rate {Math.round(evaluation.contactAvoidanceRate * 1000) / 10}% of the initial missing
            cohort. Propagation multiplier {evaluation.propagationMultiplier}. PILOT DATASET — not EU DPP complete.
          </p>
          <ul className="mt-6 space-y-2 text-[14.5px]">
            {data?.sentences.map((sentence) => (
              <li key={sentence}>{sentence}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
