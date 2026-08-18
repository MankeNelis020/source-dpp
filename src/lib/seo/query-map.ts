/**
 * Query → canonical page. One cluster, one URL. Not a public page.
 * Use for internal AI-visibility benchmarks and cannibalisation checks.
 */
export const QUERY_MAP: { intent: string; query: string; path: string }[] = [
  { intent: "definition", query: "what is a Digital Product Passport", path: "/digital-product-passport/what-is-a-dpp" },
  { intent: "definition", query: "what is DPP", path: "/digital-product-passport/what-is-a-dpp" },
  { intent: "definition", query: "what is ESPR", path: "/digital-product-passport/espr" },
  { intent: "responsibility", query: "who is responsible for a Digital Product Passport", path: "/digital-product-passport/who-is-responsible" },
  { intent: "responsibility", query: "is the retailer responsible for DPP", path: "/digital-product-passport/who-is-responsible" },
  { intent: "responsibility", query: "does an importer need to create a DPP", path: "/digital-product-passport/who-is-responsible" },
  { intent: "applicability", query: "which products need a Digital Product Passport", path: "/digital-product-passport/espr" },
  { intent: "implementation", query: "how to collect DPP data from suppliers", path: "/how-it-works" },
  { intent: "implementation", query: "how to prepare thousands of SKUs for DPP", path: "/digital-product-passport/dpp-readiness" },
  { intent: "software", query: "Digital Product Passport software", path: "/" },
  { intent: "software", query: "DPP readiness software", path: "/" },
  { intent: "software", query: "DPP readiness tool", path: "/digital-product-passport/dpp-readiness" },
  { intent: "operational", query: "DPP data gap analysis", path: "/methodology" },
  { intent: "operational", query: "DPP supplier evidence", path: "/suppliers" },
  { intent: "commercial", query: "SOURCE pricing", path: "/pricing" },
];
