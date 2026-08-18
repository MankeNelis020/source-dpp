import { SourceLabel } from "./ui";

export function AnswerBlock({
  question,
  answer,
  children,
}: {
  question: string;
  answer: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="border border-ink/8 bg-card p-6 md:p-8">
      <SourceLabel>Direct answer</SourceLabel>
      <h2 className="mt-3 font-[family-name:var(--font-space)] text-[22px] font-medium tracking-[-0.02em] md:text-[24px]">
        {question}
      </h2>
      <p className="mt-4 text-[16px] leading-relaxed text-ink">{answer}</p>
      {children ? <div className="mt-4 text-[14.5px] leading-relaxed text-ink/70">{children}</div> : null}
    </section>
  );
}

export function FactBlock({
  kind,
  children,
}: {
  kind: "regulation" | "interpretation" | "recommendation";
  children: React.ReactNode;
}) {
  const label =
    kind === "regulation"
      ? "Regulation"
      : kind === "interpretation"
        ? "SOURCE interpretation"
        : "SOURCE recommendation";
  return (
    <aside className="border-l-2 border-ink/20 pl-4">
      <p className="font-[family-name:var(--font-plex)] text-[10px] font-medium uppercase tracking-[0.14em] text-ink/45">
        {kind === "regulation" ? label : kind === "interpretation" ? label : label}
      </p>
      <div className="mt-2 text-[14px] leading-relaxed text-ink/80">{children}</div>
    </aside>
  );
}

export function Provenance({
  published,
  reviewed,
}: {
  published: string;
  reviewed: string;
}) {
  return (
    <p className="font-[family-name:var(--font-plex)] text-[11px] text-ink/45">
      Written by{" "}
      <a href="/authors/source-research" className="underline-offset-2 hover:underline">
        SOURCE Research
      </a>
      . Published {published}. Last reviewed {reviewed}. Not legal advice.
    </p>
  );
}

export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <dl className="space-y-8">
      {items.map((item) => (
        <div key={item.q}>
          <dt className="font-[family-name:var(--font-space)] text-[18px] tracking-[-0.02em]">{item.q}</dt>
          <dd className="mt-2 text-[14.5px] leading-relaxed text-ink/70">{item.a}</dd>
        </div>
      ))}
    </dl>
  );
}
