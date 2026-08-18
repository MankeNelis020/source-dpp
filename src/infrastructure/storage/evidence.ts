import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface EvidenceStorage {
  putImmutable(input: { key: string; bytes: Uint8Array; sha256: string; mimeType: string }): Promise<void>;
  createSignedRead(input: { key: string; ttlSeconds: number }): Promise<string>;
  deleteTemporary(key: string): Promise<void>;
}

function storageSecret(): string {
  const secret = process.env.SOURCE_STORAGE_SIGNING_SECRET ?? process.env.SOURCE_SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production" && process.env.SOURCE_DEMO_AUTH !== "1") {
    throw new Error("SOURCE_STORAGE_SIGNING_SECRET is required in production.");
  }
  return "source-demo-storage-signing-not-for-production";
}

export class MemoryEvidenceStorage implements EvidenceStorage {
  private objects = new Map<string, { bytes: Uint8Array; sha256: string; mimeType: string }>();

  async putImmutable(input: { key: string; bytes: Uint8Array; sha256: string; mimeType: string }): Promise<void> {
    if (this.objects.has(input.key)) {
      throw new Error("Evidence objects are immutable");
    }
    this.objects.set(input.key, { bytes: input.bytes, sha256: input.sha256, mimeType: input.mimeType });
  }

  async createSignedRead(input: { key: string; ttlSeconds: number }): Promise<string> {
    const exp = Date.now() + input.ttlSeconds * 1000;
    const nonce = randomBytes(16).toString("base64url");
    const payload = `${input.key}.${exp}.${nonce}`;
    const sig = createHmac("sha256", storageSecret()).update(payload).digest("base64url");
    return `memory-sign://${payload}.${sig}`;
  }

  async deleteTemporary(key: string): Promise<void> {
    if (!key.startsWith("tmp/")) {
      throw new Error("Only temporary keys may be deleted");
    }
    this.objects.delete(key);
  }
}

export function verifySignedRead(url: string): { key: string; exp: number } | null {
  if (!url.startsWith("memory-sign://")) return null;
  const raw = url.slice("memory-sign://".length);
  const parts = raw.split(".");
  if (parts.length < 4) return null;
  const sig = parts.pop()!;
  const payload = parts.join(".");
  const expected = createHmac("sha256", storageSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [key, expRaw] = payload.split(".");
  const exp = Number(expRaw);
  if (!key || Number.isNaN(exp) || exp < Date.now()) return null;
  return { key, exp };
}

let singleton: MemoryEvidenceStorage | undefined;

export function getMemoryEvidenceStorage(): MemoryEvidenceStorage {
  if (!singleton) singleton = new MemoryEvidenceStorage();
  return singleton;
}
