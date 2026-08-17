"use client";

import { useEffect, useState } from "react";
import { EvidenceLine, Mono, SourceLabel, StatusPill } from "./ui";
import { cn } from "@/lib/utils";

const STEPS = [
  { delay: 200, id: "root" },
  { delay: 700, id: "frame" },
  { delay: 1200, id: "textile" },
  { delay: 1700, id: "pack" },
];

export function HeroGraph() {
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timers = STEPS.map((step) =>
      setTimeout(() => setVisible((v) => ({ ...v, [step.id]: true })), step.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="border border-[#101A15]/10 bg-[#FBFCFA] p-6">
      <SourceLabel>SOURCE Graph</SourceLabel>
      <div className="mt-5 font-[family-name:var(--font-plex)] text-[13px] leading-7 text-[#101A15]">
        <div className={cn("transition-opacity duration-700", visible.root ? "opacity-100" : "opacity-0")}>
          Urban Chair 04
        </div>
        <Node show={!!visible.frame} label="Aluminium frame">
          <div className="pl-6">
            <Mono>67% recycled</Mono>
            <EvidenceLine className="w-24" />
            <StatusPill tone="signal">Evidence verified</StatusPill>
          </div>
        </Node>
        <Node show={!!visible.textile} label="Textile">
          <div className="pl-6 text-[#101A15]/55">
            Missing origin
            <EvidenceLine missing className="w-16" />
          </div>
        </Node>
        <Node show={!!visible.pack} label="Packaging">
          <div className="pl-6">
            <StatusPill tone="teal">Supplier matched</StatusPill>
          </div>
        </Node>
      </div>
    </div>
  );
}

function Node({
  show,
  label,
  children,
}: {
  show: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mt-3 border-l border-[#101A15]/15 pl-4 transition-all duration-700",
        show ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      )}
    >
      <div className="text-[#101A15]/80">├── {label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
