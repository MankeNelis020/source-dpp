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
    title: "Digital Product Passport readiness software",
    description:
      "SOURCE connects your product catalogue, shows what evidence exists and what is missing, and helps you collect it from suppliers — so Digital Product Passports can follow from a complete record, not a blank form.",
    lastModified: "2026-08-18",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/product",
    title: "How SOURCE works on a product catalogue",
    description:
      "Connect ERP, PIM or CSV. SOURCE resolves identities, shows coverage and missing claims, groups supplier requests, and keeps an evidence ledger with permissions.",
    lastModified: "2026-08-18",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/how-it-works",
    title: "From catalogue to evidence-ready records",
    description:
      "Manufacturers connect existing administration. SOURCE resolves identities, shows gaps, collects missing evidence from suppliers, and records provenance. Humans review; the model never sets verified.",
    lastModified: "2026-08-18",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/suppliers",
    title: "SOURCE for suppliers",
    description:
      "Answer a customer request once, attach evidence, and decide who may reuse it. Magic link, no account wall before you respond.",
    lastModified: "2026-08-18",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/pricing",
    title: "Pricing",
    description:
      "SOURCE is priced on active supplier relationships, not SKUs. Pilot, Core, Scale and Enterprise. Suppliers use SOURCE free.",
    lastModified: "2026-08-18",
    robots: "index",
    sitemap: true,
    changeFrequency: "yearly",
  },
  {
    path: "/developers",
    title: "Developers and open integration",
    description:
      "Planned versioned API for actors, products, claims, evidence, permissions and requests. Connectors deliver source records; identity and permissions stay above that.",
    lastModified: "2026-08-18",
    robots: "index",
    sitemap: true,
    changeFrequency: "monthly",
  },
  {
    path: "/about",
    title: "About SOURCE",
    description:
      "SOURCE is a product-data evidence company in Amsterdam. We build DPP readiness software: identity, gaps, supplier collection and an auditable ledger — not a QR-code generator.",
    lastModified: "2026-08-18",
    robots: "index",
    sitemap: true,
    changeFrequency: "yearly",
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
    title: "Digital Product Passport readiness",
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
