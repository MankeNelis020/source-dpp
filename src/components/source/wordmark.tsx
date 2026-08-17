import { cn } from "@/lib/utils";

type MarkSize = "sm" | "md" | "lg" | "xl";

const sizeClass: Record<MarkSize, string> = {
  sm: "text-[15px]",
  md: "text-[18px]",
  lg: "text-[28px]",
  xl: "text-[40px]",
};

/** SouRCe wordmark: hanging vowels, evidence line under ou, RC as resolved core. */
export function SourceWordmark({
  className,
  size = "md",
  inverted = false,
  withTagline = false,
}: {
  className?: string;
  size?: MarkSize;
  inverted?: boolean;
  withTagline?: boolean;
}) {
  const ink = inverted ? "#FBFCFA" : "#101A15";
  return (
    <span className={cn("inline-flex flex-col items-start", className)}>
      <span
        className={cn(
          "relative inline-flex items-end font-[family-name:var(--font-space)] leading-none tracking-[-0.04em]",
          sizeClass[size]
        )}
        style={{ color: ink }}
        aria-label="SOURCE"
      >
        <span className="font-medium">S</span>
        <span className="relative mx-[0.04em] inline-flex flex-col items-stretch self-end">
          <span
            className="font-medium leading-none"
            style={{ transform: "translateY(-0.21em)" }}
          >
            ou
          </span>
          <span
            aria-hidden
            className="absolute left-0 right-0 h-[1.5px] rounded-full"
            style={{ background: "#0B6E50", bottom: "0.12em" }}
          />
        </span>
        <span className="font-bold">RC</span>
        <span
          className="font-medium leading-none"
          style={{ transform: "translateY(-0.21em)" }}
        >
          e
        </span>
      </span>
      {withTagline ? (
        <span className="mt-2 font-[family-name:var(--font-plex)] text-[9px] font-medium uppercase tracking-[0.16em] text-[#101A15]/55">
          Trusted product claims infrastructure
        </span>
      ) : null}
    </span>
  );
}

/** Quiet mark for favicon-scale: s with evidence line. */
export function SourceMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-7 w-7 items-start justify-center font-[family-name:var(--font-space)] text-[18px] font-medium leading-none text-[#101A15]",
        className
      )}
      aria-hidden
    >
      <span style={{ transform: "translateY(2px)" }}>s</span>
      <span className="absolute bottom-1 left-1.5 right-1.5 h-[1.5px] rounded-full bg-[#0B6E50]" />
    </span>
  );
}
