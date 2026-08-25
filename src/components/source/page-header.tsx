import { EvidenceLine, SourceLabel } from "./ui";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow ? <SourceLabel>{eyebrow}</SourceLabel> : <EvidenceLine />}
        <h1 className="mt-3 font-[family-name:var(--font-space)] text-[28px] font-medium tracking-[-0.02em] md:text-[33px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink/65">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}
