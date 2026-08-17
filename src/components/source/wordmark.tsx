import { cn } from "@/lib/utils";

type MarkSize = "sm" | "md" | "lg" | "xl";
type MarkVariant = "primary" | "inverted" | "mono";

const sizeClass: Record<MarkSize, string> = {
  sm: "text-[20px]",
  md: "text-[22px]",
  lg: "text-[32px]",
  xl: "text-[48px]",
};

/**
 * SOURCE wordmark construction (handbook v1.0):
 * 1. Unicase lowercase. s / r / c / e sit on the baseline at cap-height.
 * 2. Hanging vowels: o and u are smaller and lifted 0.21em to the cap-line.
 * 3. Evidence-line sits on the raised underside of o/u, floating between s and r.
 * 4. r and c form the resolved core. Never render without the evidence-line.
 */
export function SourceWordmark({
  className,
  size = "md",
  variant = "primary",
  inverted = false,
  withTagline = false,
}: {
  className?: string;
  size?: MarkSize;
  variant?: MarkVariant;
  inverted?: boolean;
  withTagline?: boolean;
}) {
  const resolved: MarkVariant = inverted ? "inverted" : variant;
  const ink = resolved === "inverted" ? "#FBFCFA" : "#101A15";
  const line = resolved === "mono" ? ink : "#0B6E50";

  return (
    <span className={cn("inline-flex flex-col items-start", className)}>
      <span
        className={cn(
          "inline-flex items-start font-[family-name:var(--font-space)] font-bold lowercase leading-none tracking-[-0.02em]",
          sizeClass[size],
          size !== "sm" && "min-w-[96px]"
        )}
        style={{ color: ink }}
        aria-label="SOURCE"
      >
        <span className="leading-none">s</span>
        <span className="relative mx-[0.03em] inline-flex flex-col items-stretch">
          <span
            className="leading-none"
            style={{ fontSize: "0.79em", transform: "translateY(0)" }}
          >
            ou
          </span>
          <span
            aria-hidden
            className="mt-[0.02em] block"
            style={{ background: line, height: "0.11em" }}
          />
        </span>
        <span className="leading-none">rc</span>
        <span className="leading-none">e</span>
      </span>
      {withTagline ? (
        <span className="mt-2 font-[family-name:var(--font-plex)] text-[9px] font-medium uppercase tracking-[0.16em] text-ink/55">
          Trusted product claims infrastructure
        </span>
      ) : null}
    </span>
  );
}

/** Quiet mark for 16–32px: s with evidence-line. */
export function SourceMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-[1em] items-start font-[family-name:var(--font-space)] text-[18px] font-bold leading-none text-ink",
        className
      )}
      aria-hidden
    >
      <span>s</span>
      <span
        className="absolute left-[0.04em] right-[0.04em] bg-signal"
        style={{ height: "0.11em", top: "0.79em" }}
      />
    </span>
  );
}

/** App icon: claim (S) and proof (line) on ink. */
export function SourceAppIcon({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const radius = Math.round(size * 0.22);
  return (
    <span
      className={cn(
        "relative inline-flex items-start justify-center bg-ink font-[family-name:var(--font-space)] font-bold leading-none text-card",
        className
      )}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: size * 0.5,
        paddingTop: size * 0.2,
      }}
      aria-hidden
    >
      S
      <span
        className="absolute bg-signal"
        style={{
          left: size * 0.28,
          right: size * 0.28,
          height: Math.max(2, size * 0.07),
          bottom: size * 0.26,
        }}
      />
    </span>
  );
}
