/** Value normalization for messy European catalogue files. Never invents missing values. */

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function normalizeToken(value?: string): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function normalizePersonOrOrgName(value?: string): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\b(gmbh|bv|b\.v\.|srl|ltd|inc|ag|oy|ab|co|kg|nv|sa|plc)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeDomain(value?: string): string {
  return (value ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? "";
}

export function parseDecimal(value?: string): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const trimmed = value.trim().replace(/\s/g, "");
  const normalized = trimmed.includes(",") && !trimmed.includes(".")
    ? trimmed.replace(",", ".")
    : trimmed.replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

export function mappingConfidence(target: string): "high" | "review" | "unknown" {
  if (target.startsWith("unknown.")) return "unknown";
  if (target.includes("name") || target.includes("gtin") || target.includes("vat") || target.includes("sku")) return "high";
  return "review";
}
