/**
 * Canonical SOURCE entity + crawl policy.
 * Keep this file the single source of truth for names, URLs and crawler decisions.
 */

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://source.eu";

export const SITE_NAME = "SOURCE";

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const SOFTWARE_ID = `${SITE_URL}/#software`;

/** One-sentence definition. Reuse in metadata, schema, about, llms.txt. */
export const SOURCE_DEFINITION =
  "SOURCE is Digital Product Passport readiness software for European manufacturers, importers and private-label brands. It connects an existing product catalogue, resolves product and supplier identity, shows what evidence exists and what is missing, and helps collect that evidence from suppliers.";

export const SOURCE_CATEGORY = "DPP readiness software";

export const SOURCE_APPLICATION_CATEGORY = "BusinessApplication";

export const SOURCE_OFFERS =
  "Catalogue connection, identity resolution, evidence gap detection, supplier collection, permissioned reuse, and an auditable evidence ledger. A Digital Product Passport is an output of that process, not the starting point.";

export const SOURCE_DOES_NOT =
  "SOURCE does not currently determine legal DPP applicability per SKU, generate a published passport or QR code, or provide legal advice.";

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
