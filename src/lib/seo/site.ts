/**
 * Canonical SOURCE entity + crawl policy.
 * Keep this file the single source of truth for names, URLs and crawler decisions.
 */

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://source-dpp.eu";

export const SITE_NAME = "SOURCE";

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const SOFTWARE_ID = `${SITE_URL}/#software`;

/** One-sentence definition. Reuse in metadata, schema, about, llms.txt. */
export const SOURCE_DEFINITION =
  "SOURCE is a product evidence resolution layer for European manufacturers. It finds evidence gaps, retrieves existing evidence, and prepares targeted supplier requests without replacing ERP, PIM, PLM or DPP platforms.";

export const SOURCE_CATEGORY = "Product evidence management";

export const SOURCE_APPLICATION_CATEGORY = "BusinessApplication";

export const SOURCE_OFFERS =
  "Evidence-gap detection, retrieval of existing evidence, scoped supplier requests, readiness gates (identity, value, evidence, scope, validity, permission, conflict), and provenance with unresolved outcomes. SOURCE prepares evidence before Digital Product Passport publication. It does not publish passports, create data carriers, or replace ERP, PIM, PLM or DPP platforms.";

export const SOURCE_DOES_NOT =
  "SOURCE does not replace ERP, PIM, PLM or DPP platforms; does not publish Digital Product Passports or create data carriers; does not determine definitive legal scope for every SKU; does not independently certify evidence; and does not guarantee supplier response or compliance.";

export const SOURCE_GEO = "European Union";

export const SOURCE_LOCATION = "Amsterdam";

export const SOURCE_PRIMARY_CUSTOMERS = [
  "Compliance Manager",
  "Product Data Manager",
  "Quality Manager",
  "Procurement Manager",
  "Digital Product Passport Project Lead",
] as const;

/**
 * Crawler policy (deliberate):
 * - Search/retrieval (Googlebot, Bingbot, OAI-SearchBot, PerplexityBot, ChatGPT-User): allow public knowledge.
 * - Model-training (GPTBot): allow public knowledge so SOURCE can be cited; block private app paths.
 *   Revisit if training use becomes undesirable; flip GPTBot to Disallow: /.
 * - Private customer graph (/app, /s, auth): never crawlable.
 */
export const PRIVATE_PATHS = [
  "/app",
  "/app/",
  "/s/",
  "/login",
  "/signup",
  "/onboarding",
] as const;

export const NOINDEX_PATH_PREFIXES = ["/app", "/s/", "/login", "/signup", "/onboarding"] as const;

export function absoluteUrl(path: string) {
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
