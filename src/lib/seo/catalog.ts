import { SITE_URL } from "./site";

export type PageRobots = "index" | "noindex";

export interface CatalogPage {
  path: string;
  title: string;
  description: string;
  /** Content last materially changed. Do not bump on deploy. */
  lastModified: string;
  robots: PageRobots;
  /** Include in sitemap.xml */
  sitemap: boolean;
  changeFrequency?: "weekly" | "monthly" | "yearly";
}

/**
 * Indexable public URLs. Sitemap, internal-link checks and IndexNow share this list.
 * lastModified is editorial, not a build timestamp.
 */
export const CATALOG: CatalogPage[] = [
  {
    path: "/",
    title: "Lightweight in your stack. Heavyweight on evidence.",
    description:
      "SOURCE is a product evidence resolution layer for European manufacturers. It finds evidence gaps, retrieves existing evidence, and prepares targeted supplier requests without replacing ERP, PIM, PLM or DPP platforms.",
    lastModified: "2026-08-25",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/product",
    title: "Seven readiness gates for product evidence",
    description:
      "SOURCE separates identity, value, evidence, scope, validity, permission and conflict. A record is READY only when every applicable gate passes. Unresolved outcomes stay visible.",
    lastModified: "2026-08-25",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/how-it-works",
    title: "Product evidence lifecycle, including unsuccessful outcomes",
    description:
      "From import through identity reconciliation, gap identification, focused requests, unsuccessful supplier outcomes, readiness gates, and downstream availability. SOURCE does not publish passports.",
    lastModified: "2026-08-25",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/manufacturers",
    title: "SOURCE for manufacturer and importer teams",
    description:
      "Sit SOURCE beside ERP, PIM and PLM. Operations, quality, procurement and DPP programme teams share one evidence layer without creating another master-data system.",
    lastModified: "2026-08-25",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/suppliers",
    title: "Scoped supplier disclosure in SOURCE",
    description:
      "Answer, decline, delegate, mark uncertainty, or refuse reuse permission on a scoped request. Non-success outcomes are recorded. Nordform Metals is fictional example data.",
    lastModified: "2026-08-25",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/dpp-readiness",
    title: "DPP evidence preparation, not passport publication",
    description:
      "SOURCE prepares evidence before Digital Product Passport publication. It does not publish passports, create data carriers, or determine definitive legal scope for every SKU.",
    lastModified: "2026-08-25",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/pricing",
    title: "Controlled evidence assessment, not a public rate card",
    description:
      "SOURCE does not publish fixed prices, implementation timelines or go-live promises. Scope, connectors and commercial terms are confirmed in a controlled assessment.",
    lastModified: "2026-08-25",
    robots: "index",
    sitemap: true,
    changeFrequency: "yearly",
  },
  {
    path: "/developers",
    title: "File interchange now, APIs confirmed per assessment",
    description:
      "Current capabilities are file import and export. APIs, webhooks and named connectors are integration targets whose availability must be confirmed during assessment.",
    lastModified: "2026-08-25",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/about",
    title: "A value alone is not evidence",
    description:
      "SOURCE’s thesis: a stored number is insufficient without identity, evidence, scope, validity, permission and conflict review. Amsterdam. Not legal advice.",
    lastModified: "2026-08-25",
    robots: "index",
    sitemap: true,
    changeFrequency: "yearly",
  },
  {
    path: "/faq",
    title: "SOURCE FAQ: boundaries, readiness and pricing",
    description:
      "Does SOURCE replace ERP or publish DPPs? When is a record READY? What if a supplier declines? SOURCE does not guarantee compliance. Pricing is assessment-based.",
    lastModified: "2026-08-25",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/resources",
    title: "SOURCE resources and forthcoming briefs",
    description:
      "Published DPP knowledge and methodology, plus labelled forthcoming directions. SOURCE does not occupy URLs with empty or falsely completed articles.",
    lastModified: "2026-08-25",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/methodology",
    title: "How SOURCE assesses evidence and coverage",
    description:
      "Identity confidence, claim status, evidence levels L0–L4, missing-data grouping, and human review. What SOURCE measures today, and what it does not decide.",
    lastModified: "2026-08-18",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/authors/source-research",
    title: "SOURCE Research",
    description:
      "Editorial desk for SOURCE knowledge pages. Operational interpretation of Digital Product Passports, not legal advice. Regulatory claims cite primary EU sources.",
    lastModified: "2026-08-18",
    robots: "index",
    sitemap: true,
    changeFrequency: "yearly",
  },
  {
    path: "/digital-product-passport",
    title: "Digital Product Passport",
    description:
      "What a Digital Product Passport is under the EU ESPR framework, who may be responsible, why catalogue evidence comes before a QR code, and how SOURCE approaches DPP readiness.",
    lastModified: "2026-08-18",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/digital-product-passport/what-is-a-dpp",
    title: "What is a Digital Product Passport?",
    description:
      "A Digital Product Passport is a structured, electronically accessible record of product information defined under EU product rules. Exact fields depend on the product group’s delegated act — not a universal form.",
    lastModified: "2026-08-18",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/digital-product-passport/espr",
    title: "ESPR and the Digital Product Passport",
    description:
      "Regulation (EU) 2024/1781 is a framework in force since 18 July 2024. Product-specific Digital Product Passport obligations are set later by delegated acts, not by the ESPR text alone.",
    lastModified: "2026-08-18",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/digital-product-passport/who-is-responsible",
    title: "Who is responsible for a Digital Product Passport?",
    description:
      "Responsibility follows the economic operator placing the product on the EU market and the rules for that product group. Manufacturer, importer, distributor and retailer are not interchangeable.",
    lastModified: "2026-08-18",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/digital-product-passport/dpp-readiness",
    title: "What DPP readiness means in operations",
    description:
      "DPP readiness is whether an organisation can identify products, attach reliable evidence, see what is missing, and collect it from suppliers. Publication is not the first problem.",
    lastModified: "2026-08-18",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/resources/glossary",
    title: "Digital Product Passport glossary",
    description:
      "Short definitions of Digital Product Passport, ESPR, economic operator, evidence, delegated act, data carrier and related terms, with links to primary sources where a legal meaning exists.",
    lastModified: "2026-08-18",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
];

export const INDEXABLE_PAGES = CATALOG.filter((p) => p.robots === "index" && p.sitemap);

export function catalogByPath(path: string) {
  return CATALOG.find((p) => p.path === path);
}

export function sitemapEntries() {
  return INDEXABLE_PAGES.map((page) => ({
    url: `${SITE_URL}${page.path === "/" ? "" : page.path}`,
    lastModified: page.lastModified,
    changeFrequency: page.changeFrequency,
  }));
}
