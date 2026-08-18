import type { ReactNode } from "react";
import { PRIMARY_SOURCES, type SourceId } from "@/lib/seo/sources";

export function Citation({
  source,
  children,
}: {
  source: SourceId;
  children?: ReactNode;
}) {
  const item = PRIMARY_SOURCES[source];
  return (
    <cite className="not-italic">
      {children ? <span>{children} </span> : null}
      <a
        href={item.href}
        className="text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-signal"
        rel="noopener noreferrer"
      >
        {item.label}
      </a>
    </cite>
  );
}

export function SourceList({ ids }: { ids: SourceId[] }) {
  return (
    <ul className="mt-4 space-y-2 text-[13px] leading-relaxed text-ink/70">
      {ids.map((id) => {
        const item = PRIMARY_SOURCES[id];
        return (
          <li key={id}>
            <a
              href={item.href}
              className="text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-signal"
              rel="noopener noreferrer"
            >
              {item.label}
            </a>
            <span className="text-ink/50"> — {item.publisher}, {item.published}. {item.note}</span>
          </li>
        );
      })}
    </ul>
  );
}
