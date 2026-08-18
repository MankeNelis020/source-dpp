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
        "font-[family-name:var(--font-plex)] text-[10px] font-medium uppercase tracking-[0.14em] text-[#101A15]/55",
        className
      )}
    >
      {children}
    </span>
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
        "mt-1 block h-[2px] w-10 rounded-full",
        missing ? "bg-[#AEB4AF]/70" : "bg-[#0B6E50]",
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
    neutral: "bg-[#101A15]/6 text-[#101A15]",
    signal: "bg-[#0B6E50]/10 text-[#0B6E50]",
    attention: "bg-[#B26B2C]/12 text-[#B26B2C]",
    muted: "bg-[#AEB4AF]/25 text-[#101A15]/70",
    teal: "bg-[#2E7E8C]/12 text-[#2E7E8C]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 font-[family-name:var(--font-plex)] text-[10px] uppercase tracking-[0.12em]",
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
      <div className="font-[family-name:var(--font-plex)] text-[28px] leading-none tracking-tight text-[#101A15] md:text-[32px]">
        {value}
      </div>
      <EvidenceLine className="w-8" />
      <SourceLabel className="mt-3 block">{label}</SourceLabel>
      {hint ? <p className="mt-1 text-[12px] text-[#101A15]/55">{hint}</p> : null}
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
    <article
      className={cn(
        "border border-[#101A15]/10 bg-[#FBFCFA] p-5 shadow-[0_1px_0_rgba(16,26,21,0.04)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-[family-name:var(--font-space)] text-[40px] font-medium leading-none tracking-[-0.03em] text-[#101A15]">
            {value}
          </div>
          <EvidenceLine missing={!verified} className="w-16" />
        </div>
        <StatusPill tone={verified ? "signal" : "muted"}>
          {verified ? `✓ Verified · id ${identity}` : "Declared"}
        </StatusPill>
      </div>
      <dl className="mt-5 space-y-1.5 font-[family-name:var(--font-plex)] text-[11px] leading-relaxed text-[#101A15]/80">
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
      <dt className="text-[#101A15]/45">{k}</dt>
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
              className="h-2 w-2 rounded-full"
              style={{ background: item.color, opacity: on || active === undefined ? 1 : 0.35 }}
            />
            <Mono
              className={cn(
                "text-[11px]",
                on ? "text-[#101A15]" : "text-[#101A15]/55"
              )}
            >
              L{item.level} · {item.label}
            </Mono>
          </li>
        );
      })}
    </ol>
  );
}

export function SourceButton({
  href,
  children,
  variant = "primary",
  className,
  type,
  onClick,
  disabled,
}: {
  href?: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "signal";
  className?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const styles = {
    primary:
      "bg-[#101A15] text-[#FBFCFA] hover:bg-[#101A15]/90",
    ghost:
      "bg-transparent text-[#101A15] ring-1 ring-inset ring-[#101A15]/15 hover:bg-[#101A15]/5",
    signal:
      "bg-[#0B6E50] text-[#FBFCFA] hover:bg-[#0B6E50]/90",
  };
  const cls = cn(
    "inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2.5 text-[13px] font-medium transition-colors",
    styles[variant],
    disabled && "pointer-events-none opacity-40",
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
    <button type={type ?? "button"} className={cls} onClick={onClick} disabled={disabled}>
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
    <div className="overflow-x-auto border border-[#101A15]/10 bg-[#FBFCFA]">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-[#101A15]/10">
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

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border border-[#101A15]/10 bg-[#FBFCFA] p-8">
      <h2 className="font-[family-name:var(--font-space)] text-[20px] tracking-[-0.02em]">{title}</h2>
      <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[#101A15]/65">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
