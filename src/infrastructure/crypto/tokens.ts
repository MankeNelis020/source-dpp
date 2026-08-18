import { createHash, randomBytes, createHmac, timingSafeEqual } from "node:crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Non-secret telemetry fingerprint. Never log the raw bearer token. */
export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(`fp:${token}`).digest("hex").slice(0, 16);
}

export function hashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function generateBearerToken(): string {
  return randomBytes(32).toString("base64url");
}

export function signValue(value: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(value).digest("base64url");
  return `${value}.${sig}`;
}

export function verifySignedValue(signed: string, secret: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = createHmac("sha256", secret).update(value).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return value;
}

const WINDOW_MS = 60_000;

export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly limit: number, private readonly windowMs = WINDOW_MS) {}

  allow(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const next = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (next.length >= this.limit) {
      this.hits.set(key, next);
      return false;
    }
    next.push(now);
    this.hits.set(key, next);
    return true;
  }
}
