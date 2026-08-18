import Link from "next/link";
import { Breadcrumbs, type Crumb } from "./breadcrumbs";
import { Provenance } from "./knowledge";
import { SourceLabel } from "./ui";

export function KnowledgeLayout({
  crumbs,
  title,
  lede,
  published,
  reviewed,
  related,
  children,
}: {
  crumbs: Crumb[];
  title: string;
  lede: string;
  published: string;
  reviewed: string;
  related?: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 md:py-24">
      <Breadcrumbs items={crumbs} />
      <h1 className="mt-6 font-[family-name:var(--font-space)] text-[36px] font-medium leading-[1.08] tracking-[-0.02em] md:text-[44px]">
        {title}
      </h1>
      <p className="mt-5 text-[17px] leading-relaxed text-ink/80">{lede}</p>
      <div className="mt-4">
        <Provenance published={published} reviewed={reviewed} />
      </div>
      <div className="mt-12 space-y-10 text-[14.5px] leading-relaxed text-ink/80">{children}</div>
      {related && related.length > 0 ? (
        <aside className="mt-16 border-t border-ink/8 pt-8">
          <SourceLabel>Related</SourceLabel>
          <ul className="mt-4 space-y-2">
            {related.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-[14px] text-ink underline-offset-4 hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </article>
  );
}
