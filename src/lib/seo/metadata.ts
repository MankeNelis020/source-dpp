import type { Metadata } from "next";
import { catalogByPath, type CatalogPage } from "./catalog";
import { SITE_NAME, SITE_URL, SOURCE_DEFINITION, absoluteUrl } from "./site";

const DEFAULT_OG = "/opengraph-image";

export function pageMetadata(path: string, extras?: Partial<Metadata>): Metadata {
  const page = catalogByPath(path);
  if (!page) {
    return {
      robots: { index: false, follow: false },
      ...extras,
    };
  }
  return buildMetadata(page, extras);
}

export function buildMetadata(page: CatalogPage, extras?: Partial<Metadata>): Metadata {
  const url = absoluteUrl(page.path);
  const index = page.robots === "index";
  const title = page.title;
  return {
    title,
    description: page.description,
    alternates: { canonical: url },
    robots: index
      ? { index: true, follow: true }
      : { index: false, follow: false, nocache: true },
    openGraph: {
      type: "website",
      url,
      siteName: SITE_NAME,
      title: `${title} | ${SITE_NAME}`,
      description: page.description,
      locale: "en_GB",
      images: [{ url: DEFAULT_OG, width: 1200, height: 630, alt: `${SITE_NAME} — ${title}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description: page.description,
    },
    ...extras,
  };
}

export function noindexMetadata(title: string, description?: string): Metadata {
  return {
    title,
    description: description ?? SOURCE_DEFINITION,
    robots: { index: false, follow: false, nocache: true },
    alternates: { canonical: absoluteUrl("/") },
  };
}

export { SITE_URL };
