const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254) return undefined;
  if (trimmed.includes("..") || trimmed.startsWith(".") || trimmed.endsWith(".")) return undefined;
  if (!EMAIL_PATTERN.test(trimmed)) return undefined;
  return trimmed;
}

export function parseAllowList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((item) => normalizeEmail(item))
    .filter((item): item is string => Boolean(item));
}

export function recipientAllowed(to: string, allowList: string[]): boolean {
  if (!allowList.length) return false;
  const normalized = normalizeEmail(to);
  if (!normalized) return false;
  return allowList.includes(normalized);
}
