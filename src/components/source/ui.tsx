import Link from "next/link";
import { cn } from "@/lib/utils";
import { CONFIDENCE_LEVELS, type ConfidenceLevel } from "@/lib/source/brand";

export function SourceLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-[family-name:var(--font-plex)] text-[10px] font-medium uppercase tracking-[0.14em] text-ink/55",
        className
      )}
    >
      {children}
    </span>
  );
}

export function Display({
  as: Comp = "h1",
  size = "lg",
  children,
  className,
}: {
  as?: "h1" | "h2" | "h3" | "p";
  size?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
  className?: string;
}) {
  const sizes = {
    sm: "text-[20px] leading-snug",
    md: "text-[28px] leading-[1.12] md:text-[33px]",
    lg: "text-[40px] leading-[1.08] md:text-[48px]",
    xl: "text-[40px] leading-[1.05] md:text-[64px]",
  };
  return (
    <Comp
      className={cn(
        "font-[family-name:var(--font-space)] font-medium tracking-[-0.02em] text-ink",
        sizes[size],
        className
      )}
    >
      {children}
    </Comp>
  );
}

export function SourceCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border border-ink/8 bg-card", className)}>{children}</div>
  );
}

export function EvidenceLine({
  className,
  missing = false,
}: {
  className?: string;
  missing?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-1 block h-[2.5px] w-10",
        missing ? "bg-l0/70" : "bg-signal",
        className
      )}
    />
  );
}

export function SectionRule({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <EvidenceLine />
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

export function Mono({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("font-[family-name:var(--font-plex)] tabular-nums", className)}>
      {children}
    </span>
  );
}

export function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "signal" | "attention" | "muted" | "teal";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-ink/6 text-ink",
    signal: "bg-signal/10 text-signal",
    attention: "bg-attention/12 text-attention",
    muted: "bg-l0/25 text-ink/70",
    teal: "bg-l2/12 text-l2",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 font-[family-name:var(--font-plex)] text-[10px] uppercase tracking-[0.14em]",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

export function Metric({
  value,
  label,
  hint,
}: {
  value: string;
  label: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="font-[family-name:var(--font-plex)] text-[28px] leading-none tracking-tight text-ink md:text-[32px]">
        {value}
      </div>
      <EvidenceLine className="w-8" />
      <SourceLabel className="mt-3 block">{label}</SourceLabel>
      {hint ? <p className="mt-1 text-[12px] text-ink/55">{hint}</p> : null}
    </div>
  );
}

export function ClaimCard({
  value = "67%",
  property = "recycled_content",
  subject = "AL-FRAME-881",
  issuer = "accredited certifier",
  valid = "2028-12-31",
  reuse = "allowed · DPP",
  verified = true,
  identity = "99.7%",
  className,
}: {
  value?: string;
  property?: string;
  subject?: string;
  issuer?: string;
  valid?: string;
  reuse?: string;
  verified?: boolean;
  identity?: string;
  className?: string;
}) {
  return (
    <article className={cn("border border-ink/8 bg-card p-6", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-[family-name:var(--font-space)] text-[40px] font-medium leading-none tracking-[-0.02em] text-ink">
            {value}
          </div>
          <EvidenceLine missing={!verified} className="w-16" />
        </div>
        <StatusPill tone={verified ? "signal" : "muted"}>
          {verified ? `Verified · id ${identity}` : "Declared"}
        </StatusPill>
      </div>
      <dl className="mt-6 space-y-1.5 font-[family-name:var(--font-plex)] text-[11px] leading-relaxed text-ink/80">
        <Row k="subject" v={subject} />
        <Row k="property" v={property} />
        <Row k="issuer" v={issuer} />
        <Row k="valid" v={valid} />
        <Row k="reuse" v={reuse} />
      </dl>
    </article>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3">
      <dt className="text-ink/45">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

export function ConfidenceLadder({ active }: { active?: ConfidenceLevel }) {
  return (
    <ol className="space-y-2">
      {CONFIDENCE_LEVELS.map((item) => {
        const on = active === item.level;
        return (
          <li key={item.level} className="flex items-center gap-3">
            <span
              className="h-2.5 w-2.5 shrink-0"
              style={{
                background: item.color,
                opacity: on || active === undefined ? 1 : 0.35,
              }}
            />
            <Mono className={cn("text-[11px]", on ? "text-ink" : "text-ink/55")}>
              L{item.level} · {item.label}
            </Mono>
          </li>
        );
      })}
    </ol>
  );
}

export function ConfidenceRamp({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-1.5 w-full", className)} aria-hidden>
      {CONFIDENCE_LEVELS.map((item) => (
        <div key={item.level} className="flex-1" style={{ background: item.color }} />
      ))}
    </div>
  );
}

export function SourceButton({
  href,
  children,
  variant = "primary",
  className,
  type,
  onClick,
}: {
  href?: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "signal";
  className?: string;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  const styles = {
    primary: "bg-ink text-card hover:bg-ink/90",
    ghost: "bg-transparent text-ink ring-1 ring-inset ring-ink/15 hover:bg-ink/5",
    signal: "bg-signal text-card hover:bg-signal/90",
  };
  const cls = cn(
    "inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors",
    styles[variant],
    className
  );
  if (href) {
    return (
      <Link href={href} className={cls} onClick={onClick}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type ?? "button"} className={cls} onClick={onClick}>
      {children}
    </button>
  );
}

export function SourceTable({
  columns,
  children,
}: {
  columns: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto border border-ink/8 bg-card">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-ink/8">
            {columns.map((col) => (
              <th key={col} className="px-4 py-3">
                <SourceLabel>{col}</SourceLabel>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
