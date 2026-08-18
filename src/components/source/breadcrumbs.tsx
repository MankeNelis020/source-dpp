import Link from "next/link";
import { JsonLd } from "./json-ld";
import { breadcrumbList } from "@/lib/seo/jsonld";

export type Crumb = { name: string; path: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const trail = [{ name: "SOURCE", path: "/" }, ...items];
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          ...breadcrumbList(trail),
        }}
      />
      <nav aria-label="Breadcrumb" className="text-[12px] text-ink/55">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {trail.map((item, i) => (
            <li key={`${item.path}-${item.name}`} className="inline-flex items-center gap-2">
              {i > 0 ? <span aria-hidden className="text-ink/25">/</span> : null}
              {i === trail.length - 1 ? (
                <span className="text-ink/80">{item.name}</span>
              ) : (
                <Link href={item.path} className="hover:text-ink">
                  {item.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
