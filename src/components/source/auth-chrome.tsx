import Link from "next/link";
import { SourceWordmark } from "@/components/source/wordmark";
import { SourceLabel } from "@/components/source/ui";

export function AuthChrome({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <SourceWordmark size="lg" />
      <h1 className="mt-10 font-[family-name:var(--font-space)] text-[28px] font-medium tracking-[-0.02em]">
        {title}
      </h1>
      {description ? <p className="mt-3 text-[14.5px] leading-relaxed text-[#101A15]/70">{description}</p> : null}
      <div className="mt-8">{children}</div>
    </div>
  );
}

export function AuthField({
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  required,
  minLength,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="block">
      <SourceLabel>{label}</SourceLabel>
      <input
        type={type}
        required={required}
        autoComplete={autoComplete}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-sm border border-[#101A15]/15 bg-[#FBFCFA] px-3 py-2.5 text-[13px] outline-none focus:border-[#0B6E50]"
      />
    </label>
  );
}

export function AuthFooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <p className="mt-8 text-center text-[13px] text-[#101A15]/60">
      <Link href={href} className="text-[#101A15] underline-offset-4 hover:underline">
        {children}
      </Link>
    </p>
  );
}
