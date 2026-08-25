/** SOURCE brand tokens and copy, from the huisstijl handbook and website spec. */

export const SOURCE_COLORS = {
  ink: "#101A15",
  paper: "#EFF2ED",
  signal: "#0B6E50",
  card: "#FBFCFA",
  attention: "#B26B2C",
  l0: "#AEB4AF",
  l1: "#7E8A92",
  l2: "#2E7E8C",
  l3: "#0B6E50",
  l4: "#064D39",
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
  "audit-ready",
  "audit ready",
  "automatically requested",
  "trusted product claims infrastructure",
];

export const SOURCE_USPS = [
  "Lightweight in your stack: SOURCE does not replace ERP, PIM, PLM or DPP platforms.",
  "Finds evidence gaps, retrieves existing evidence, and prepares targeted supplier requests.",
  "READY only when identity, value, evidence, scope, validity, permission and conflict gates pass.",
  "Decline, uncertainty, delegation, silence and unresolved outcomes are recorded — not hidden.",
];

export const SOURCE_TONE =
  "Precies, bescheiden, infrastructureel. Schrijf als een auditor die je aardig vindt: exact, kort, nooit meer belovend dan het bewijs draagt. Toon status, niet waarheid. Noem het getal. Actieve stem. Ontbrekend bewijs is zichtbaar. Engelse producttermen (claim, evidence, reuse, provenance) blijven Engels.";

export const SOURCE_MISSION =
  "SOURCE is a product evidence resolution layer for European manufacturers. It finds evidence gaps, retrieves existing evidence, and prepares targeted supplier requests without replacing ERP, PIM, PLM or DPP platforms.";

export const SOURCE_VISUAL_STYLE = {
  logoPosition: "top-left" as const,
  ctaStyle: "square" as const,
  contentAlign: "left" as const,
  websiteUrl: "https://source-dpp.eu",
  wordmarkLift: "0.21em",
  minDigitalWidth: "96px",
  minPrintWidth: "22mm",
  styleNotes:
    "Ink-on-paper, Swiss grid, square geometry. No stock photos, no logo walls. Signal green (#0B6E50) only for verified or active states — never decorative. Wordmark is unicase lowercase: s/r/c/e on the baseline, o/u lifted 0.21em to the cap-line, evidence-line under ou. Never use the wordmark without the evidence-line. Every verified value gets the evidence line underneath; if evidence is missing, the line is missing. Identifiers, values, status labels and units in IBM Plex Mono. Headlines in Space Grotesk with −2% tracking, sentence case. Labels: mono, uppercase, +14% tracking. Paper 70 / Ink 22 / Signal 8. Calm, infrastructural, precise.",
};

export const PUBLIC_NAV = [
  { href: "/product", label: "Product" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/manufacturers", label: "Manufacturers" },
  { href: "/dpp-readiness", label: "DPP readiness" },
  { href: "/pricing", label: "Pricing" },
] as const;

export const WORKSPACE_NAV = [
  { href: "/app", label: "Overview" },
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
