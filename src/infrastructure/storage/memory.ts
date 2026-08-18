import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ObjectMetadata, ObjectStorage, SignedRead, StoredObjectBytes } from "./port";
import { ObjectStorageError, isTemporaryObjectKey } from "./port";

export type MemoryObjectEntry = {
  bytes: Uint8Array;
  mimeType: string;
  sha256: string;
};

export type MemoryObjectMap = Map<string, MemoryObjectEntry>;

function loc(bucket: string, key: string) {
  return `${bucket}::${key}`;
}

function storageSecret(): string {
  const secret = process.env.SOURCE_STORAGE_SIGNING_SECRET ?? process.env.SOURCE_SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production" && process.env.SOURCE_DEMO_AUTH !== "1") {
    throw new Error("SOURCE_STORAGE_SIGNING_SECRET is required in production.");
  }
  return "source-demo-storage-signing-not-for-production";
}

export class MemoryObjectStorage implements ObjectStorage {
  readonly kind = "memory" as const;

  constructor(private readonly objects: MemoryObjectMap = new Map()) {}

  async putImmutable(input: {
    bucket: string;
    key: string;
    bytes: Uint8Array;
    mimeType: string;
    sha256: string;
  }): Promise<void> {
    const id = loc(input.bucket, input.key);
    if (this.objects.has(id)) {
      throw new ObjectStorageError("IMMUTABLE", "Stored objects are immutable.");
    }
    this.objects.set(id, {
      bytes: Uint8Array.from(input.bytes),
      mimeType: input.mimeType,
      sha256: input.sha256,
    });
  }

  async get(bucket: string, key: string): Promise<StoredObjectBytes | null> {
    const row = this.objects.get(loc(bucket, key));
    if (!row) return null;
    return {
      bytes: Uint8Array.from(row.bytes),
      mimeType: row.mimeType,
      size: row.bytes.byteLength,
      sha256: row.sha256,
    };
  }

  async head(bucket: string, key: string): Promise<ObjectMetadata | null> {
    const row = this.objects.get(loc(bucket, key));
    if (!row) return null;
    return { size: row.bytes.byteLength, mimeType: row.mimeType, sha256: row.sha256 };
  }

  async createSignedRead(input: { bucket: string; key: string; ttlSeconds: number }): Promise<SignedRead> {
    const ttlSeconds = Math.max(1, Math.min(input.ttlSeconds, 3600));
    const exp = Date.now() + ttlSeconds * 1000;
    const nonce = randomBytes(16).toString("base64url");
    const payload = `${input.bucket}.${input.key}.${exp}.${nonce}`;
    const sig = createHmac("sha256", storageSecret()).update(payload).digest("base64url");
    return {
      url: `memory-sign://${payload}.${sig}`,
      expiresAt: new Date(exp).toISOString(),
      ttlSeconds,
    };
  }

  async deleteTemporary(bucket: string, key: string): Promise<void> {
    if (!isTemporaryObjectKey(key)) {
      throw new ObjectStorageError("TEMPORARY_ONLY", "Only temporary keys may be deleted.");
    }
    this.objects.delete(loc(bucket, key));
  }

  async health(): Promise<"ok" | "error"> {
    return "ok";
  }

  /** Test helper: number of stored objects in this map. */
  size() {
    return this.objects.size;
  }
}

export function verifyMemorySignedRead(url: string): { bucket: string; key: string; exp: number } | null {
  if (!url.startsWith("memory-sign://")) return null;
  const raw = url.slice("memory-sign://".length);
  const parts = raw.split(".");
  if (parts.length < 5) return null;
  const sig = parts.pop()!;
  const payload = parts.join(".");
  const expected = createHmac("sha256", storageSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [bucket, key, expRaw] = payload.split(".");
  const exp = Number(expRaw);
  if (!bucket || !key || Number.isNaN(exp) || exp < Date.now()) return null;
  return { bucket, key, exp };
}

const defaultMap: MemoryObjectMap = new Map();
let singleton: MemoryObjectStorage | undefined;

export function getMemoryObjectStorage(): MemoryObjectStorage {
  if (!singleton) singleton = new MemoryObjectStorage(defaultMap);
  return singleton;
}

export function resetMemoryObjectStorage() {
  defaultMap.clear();
  singleton = new MemoryObjectStorage(defaultMap);
}

export function createSharedMemoryObjectStorage(map: MemoryObjectMap = new Map()): MemoryObjectStorage {
  return new MemoryObjectStorage(map);
}
