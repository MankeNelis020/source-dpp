import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ObjectMetadata, ObjectStorage, SignedRead, StoredObjectBytes } from "./port";
import { ObjectStorageError, isTemporaryObjectKey } from "./port";
import { sha256Hex } from "./files";

/**
 * Supabase Storage adapter.
 *
 * Uses the service-role key as an infrastructure credential so the server can
 * write to private buckets. Service role bypasses Storage RLS. That is not an
 * authorization decision — SOURCE policy must already have allowed the action.
 *
 * Never expose this client or the service-role key to the browser.
 */
export class SupabaseObjectStorage implements ObjectStorage {
  readonly kind = "supabase" as const;
  private readonly client: SupabaseClient;

  constructor(input: { supabaseUrl: string; serviceRoleKey: string }) {
    this.client = createClient(input.supabaseUrl, input.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async putImmutable(input: {
    bucket: string;
    key: string;
    bytes: Uint8Array;
    mimeType: string;
    sha256: string;
  }): Promise<void> {
    const existing = await this.head(input.bucket, input.key);
    if (existing) {
      throw new ObjectStorageError("IMMUTABLE", "Stored objects are immutable.");
    }
    const { error } = await this.client.storage.from(input.bucket).upload(input.key, input.bytes, {
      contentType: input.mimeType,
      upsert: false,
    });
    if (error) {
      if (/already exists|duplicate|409/i.test(error.message)) {
        throw new ObjectStorageError("IMMUTABLE", "Stored objects are immutable.");
      }
      throw new ObjectStorageError("UNAVAILABLE", "We couldn't store this file. Nothing has been added yet.");
    }
  }

  async get(bucket: string, key: string): Promise<StoredObjectBytes | null> {
    const { data, error } = await this.client.storage.from(bucket).download(key);
    if (error || !data) {
      if (error && /not found|404/i.test(error.message)) return null;
      if (!data) return null;
      throw new ObjectStorageError("UNAVAILABLE", "Evidence is temporarily unavailable.");
    }
    const buf = new Uint8Array(await data.arrayBuffer());
    return {
      bytes: buf,
      mimeType: data.type || "application/octet-stream",
      size: buf.byteLength,
      sha256: sha256Hex(buf),
    };
  }

  async head(bucket: string, key: string): Promise<ObjectMetadata | null> {
    const slash = key.lastIndexOf("/");
    const folder = slash >= 0 ? key.slice(0, slash) : "";
    const name = slash >= 0 ? key.slice(slash + 1) : key;
    const { data, error } = await this.client.storage.from(bucket).list(folder, { search: name, limit: 20 });
    if (error) {
      throw new ObjectStorageError("UNAVAILABLE", "Evidence is temporarily unavailable.");
    }
    const found = data?.find((row) => row.name === name);
    if (!found) return null;
    const size = Number(found.metadata?.size ?? found.metadata?.contentLength ?? 0);
    const mimeType = String(found.metadata?.mimetype ?? found.metadata?.contentType ?? "application/octet-stream");
    return { size, mimeType };
  }

  async createSignedRead(input: { bucket: string; key: string; ttlSeconds: number }): Promise<SignedRead> {
    const ttlSeconds = Math.max(1, Math.min(input.ttlSeconds, 3600));
    const { data, error } = await this.client.storage.from(input.bucket).createSignedUrl(input.key, ttlSeconds);
    if (error || !data?.signedUrl) {
      throw new ObjectStorageError("UNAVAILABLE", "Evidence is temporarily unavailable.");
    }
    return {
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      ttlSeconds,
    };
  }

  async deleteTemporary(bucket: string, key: string): Promise<void> {
    if (!isTemporaryObjectKey(key)) {
      throw new ObjectStorageError("TEMPORARY_ONLY", "Only temporary keys may be deleted.");
    }
    const { error } = await this.client.storage.from(bucket).remove([key]);
    if (error && !/not found|404/i.test(error.message)) {
      throw new ObjectStorageError("UNAVAILABLE", "We couldn't store this file. Nothing has been added yet.");
    }
  }

  async health(): Promise<"ok" | "error"> {
    const { error } = await this.client.storage.listBuckets();
    return error ? "error" : "ok";
  }
}
