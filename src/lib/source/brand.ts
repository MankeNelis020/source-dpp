/** SOURCE brand tokens and copy, from the huisstijl handbook and website spec. */

export const SOURCE_COLORS = {
  ink: "#101A15",
  paper: "#EFF2ED",
  signal: "#0B6E50",
  card: "#FBFCFA",
  attention: "#B26B2C",
  l0: "#AEB4AF",
  l1: "#7E8A72",
  l2: "#2E7E8C",
  l3: "#0B6E50",
  l4: "#0A4D40",
} as const;

export const SOURCE_FONTS = ["Space Grotesk", "Inter", "IBM Plex Mono"] as const;

export const SOURCE_FORBIDDEN_WORDS = [
  "gegarandeerd",
  "guarantee",
  "guaranteed",
  "proof of truth",
  "fully automated",
  "effortless",
  "100% duurzaam",
  "enige bron van waarheid",
  "the only source of truth",
  "AI regelt automatisch",
];

export const SOURCE_USPS = [
  "Connect existing ERP, PIM, PLM or CSV — SOURCE finds the gaps.",
  "Identity resolution before evidence: precision before automation.",
  "Suppliers answer once and decide how claims may be reused.",
  "Every claim carries provenance, permission and a verification level — never 'true'.",
];

export const SOURCE_TONE =
  "Precies, bescheiden, infrastructureel. Schrijf als een auditor die je aardig vindt: exact, kort, nooit meer belovend dan het bewijs draagt. Toon status, niet waarheid. Noem het getal. Actieve stem. Ontbrekend bewijs is zichtbaar. Engelse producttermen (claim, evidence, reuse, provenance) blijven Engels.";

export const SOURCE_MISSION =
  "The evidence layer for product data. Connect your product system. SOURCE resolves what you have, what is missing, what can be trusted and what may be reused.";

export const SOURCE_VISUAL_STYLE = {
  logoPosition: "top-left" as const,
  ctaStyle: "square" as const,
  contentAlign: "left" as const,
  websiteUrl: "https://source.eu",
  styleNotes:
    "Ink-on-paper. No stock photos, no logo walls. Signal green (#0B6E50) only for verified or active states — never decorative. Every verified value gets the evidence line underneath; if evidence is missing, the line is missing. All identifiers, values, status labels and units in IBM Plex Mono. Headlines in Space Grotesk with −2% tracking, sentence case. Labels: mono, uppercase, +14% tracking. Paper 70 / Ink 22 / Signal 8. Calm, infrastructural, precise.",
};

export const PUBLIC_NAV = [
  { href: "/product", label: "Product" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/suppliers", label: "For suppliers" },
  { href: "/developers", label: "Developers" },
  { href: "/pricing", label: "Pricing" },
] as const;

export const WORKSPACE_NAV = [
  { href: "/app", label: "Overview" },
  { href: "/app/missing", label: "Missing information" },
  { href: "/app/products", label: "Products" },
  { href: "/app/suppliers", label: "Suppliers" },
  { href: "/app/claims", label: "Claims" },
  { href: "/app/evidence", label: "Evidence" },
  { href: "/app/requests", label: "Requests" },
  { href: "/app/reviews", label: "Reviews" },
  { href: "/app/graph", label: "Graph" },
  { href: "/app/integrations", label: "Integrations" },
  { href: "/app/exports", label: "Exports" },
  { href: "/app/settings", label: "Settings" },
] as const;

export type ConfidenceLevel = 0 | 1 | 2 | 3 | 4;

export const CONFIDENCE_LEVELS: {
  level: ConfidenceLevel;
  label: string;
  color: string;
}[] = [
  { level: 0, label: "Unknown", color: SOURCE_COLORS.l0 },
  { level: 1, label: "Declared", color: SOURCE_COLORS.l1 },
  { level: 2, label: "Evidenced", color: SOURCE_COLORS.l2 },
  { level: 3, label: "Verified", color: SOURCE_COLORS.l3 },
  { level: 4, label: "Traceable", color: SOURCE_COLORS.l4 },
];
