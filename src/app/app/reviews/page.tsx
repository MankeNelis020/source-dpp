"use client";

import { useState } from "react";
import { DEMO_EVIDENCE_REVIEWS, DEMO_IDENTITY_REVIEWS } from "@/lib/source/demo-data";
import { PageHeader } from "@/components/source/page-header";
import { SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";

export default function ReviewsPage() {
  const [identity, setIdentity] = useState(DEMO_IDENTITY_REVIEWS);
  const [evidence, setEvidence] = useState(DEMO_EVIDENCE_REVIEWS);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Reviews"
        description="Human review is a first-class workflow: fast cards, not a form. SOURCE never auto-merges in doubt."
      />
      <h2 className="font-[family-name:var(--font-space)] text-[20px]">Identity review</h2>
      <p className="mt-1 text-[13px] text-[#101A15]/60">Are these the same supplier?</p>
      <div className="mt-4 space-y-3">
        {identity.map((item) => (
          <article key={item.id} className="border border-[#101A15]/10 bg-[#FBFCFA] p-5">
            <SourceLabel>likely matches</SourceLabel>
            <div className="mt-2 grid gap-4 md:grid-cols-2">
              <div>
                <div className="font-[family-name:var(--font-plex)] text-[13px]">{item.source}</div>
              </div>
              <div>
                <div className="font-[family-name:var(--font-space)] text-[18px]">{item.candidate}</div>
                <p className="mt-1 text-[12px] text-[#101A15]/55">{item.meta}</p>
                <div className="mt-2">
                  <StatusPill tone="signal">Confidence {item.confidence}%</StatusPill>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <SourceButton onClick={() => setIdentity((rows) => rows.filter((r) => r.id !== item.id))}>
                Confirm
              </SourceButton>
              <SourceButton
                variant="ghost"
                onClick={() => setIdentity((rows) => rows.filter((r) => r.id !== item.id))}
              >
                Reject
              </SourceButton>
              <SourceButton variant="ghost">Search another</SourceButton>
            </div>
          </article>
        ))}
        {identity.length === 0 ? (
          <p className="text-[13px] text-[#0B6E50]">Identity queue clear. No data was merged without confirmation.</p>
        ) : null}
      </div>

      <h2 className="mt-12 font-[family-name:var(--font-space)] text-[20px]">Evidence review</h2>
      <div className="mt-4 space-y-3">
        {evidence.map((item) => (
          <article key={item.id} className="border border-[#101A15]/10 bg-[#FBFCFA] p-5">
            <SourceLabel>{item.document}</SourceLabel>
            <p className="mt-2 text-[14.5px]">
              We found: {item.finding} · Page {item.page} · Confidence {item.confidence}%
            </p>
            <p className="mt-2 text-[12px] text-[#101A15]/55">
              AI proposes; SOURCE records provenance. This does not set VERIFIED = true.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <SourceButton onClick={() => setEvidence((rows) => rows.filter((r) => r.id !== item.id))}>
                Accept
              </SourceButton>
              <SourceButton variant="ghost">Correct</SourceButton>
              <SourceButton
                variant="ghost"
                onClick={() => setEvidence((rows) => rows.filter((r) => r.id !== item.id))}
              >
                Not present
              </SourceButton>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
