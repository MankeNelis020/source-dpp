/**
 * Canonical timestamptz encoding at the persistence boundary.
 * Domain records use ISO 8601 strings. node-pg returns Date objects.
 * Never use Date.toString() / String(date) — Postgres rejects that format.
 */

const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export class TimestampEncodingError extends Error {
  readonly code = "INVALID_TIMESTAMP";

  constructor(message = "Timestamp must be an ISO 8601 value.") {
    super(message);
    this.name = "TimestampEncodingError";
  }
}

export type TimestampInput = string | Date | null | undefined;

export function normalizeTimestamp(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TimestampEncodingError();
    }
    return value.toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!ISO_TIMESTAMP.test(trimmed)) {
      throw new TimestampEncodingError();
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new TimestampEncodingError();
    }
    return trimmed;
  }
  throw new TimestampEncodingError();
}

export function requireTimestamp(value: unknown): string {
  const normalized = normalizeTimestamp(value);
  if (!normalized) {
    throw new TimestampEncodingError("Timestamp is required.");
  }
  return normalized;
}
