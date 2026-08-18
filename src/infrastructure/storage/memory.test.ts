import { describe, expect, it } from "vitest";
import { createSharedMemoryObjectStorage } from "./memory";
import { ObjectStorageError } from "./port";
import { AllowlistFileScanner, detectKind, sha256Hex } from "./files";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

describe("MemoryObjectStorage", () => {
  it("keeps bytes across adapter instances that share the same map", async () => {
    const map = new Map();
    const first = createSharedMemoryObjectStorage(map);
    await first.putImmutable({
      bucket: "source-evidence",
      key: "o/one",
      bytes: PDF,
      mimeType: "application/pdf",
      sha256: sha256Hex(PDF),
    });
    const second = createSharedMemoryObjectStorage(map);
    const loaded = await second.get("source-evidence", "o/one");
    expect(loaded?.sha256).toBe(sha256Hex(PDF));
    expect(Buffer.from(loaded!.bytes).equals(PDF)).toBe(true);
  });

  it("rejects overwrite of the same key", async () => {
    const storage = createSharedMemoryObjectStorage();
    await storage.putImmutable({
      bucket: "source-evidence",
      key: "o/imm",
      bytes: PDF,
      mimeType: "application/pdf",
      sha256: sha256Hex(PDF),
    });
    await expect(
      storage.putImmutable({
        bucket: "source-evidence",
        key: "o/imm",
        bytes: PDF,
        mimeType: "application/pdf",
        sha256: sha256Hex(PDF),
      })
    ).rejects.toMatchObject({ code: "IMMUTABLE" });
  });

  it("records a short signed-read TTL instead of a permanent link", async () => {
    const storage = createSharedMemoryObjectStorage();
    const signed = await storage.createSignedRead({ bucket: "source-evidence", key: "o/x", ttlSeconds: 300 });
    expect(signed.ttlSeconds).toBe(300);
    const exp = Date.parse(signed.expiresAt);
    expect(exp).toBeGreaterThan(Date.now() + 60_000);
    expect(exp).toBeLessThan(Date.now() + 10 * 60_000);
    expect(signed.url).not.toContain("service");
  });

  it("only deletes temporary keys", async () => {
    const storage = createSharedMemoryObjectStorage();
    await storage.putImmutable({
      bucket: "source-evidence",
      key: "o/keep",
      bytes: PDF,
      mimeType: "application/pdf",
      sha256: sha256Hex(PDF),
    });
    await expect(storage.deleteTemporary("source-evidence", "o/keep")).rejects.toBeInstanceOf(ObjectStorageError);
  });
});

describe("allowlist scanner", () => {
  const scanner = new AllowlistFileScanner();

  it("rejects executables", async () => {
    const exe = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00]);
    expect(detectKind(exe)).toBe("executable");
    const result = await scanner.scan({ bytes: exe, filenameHint: "payload.exe", purpose: "EVIDENCE" });
    expect(result.status).toBe("REJECTED");
  });

  it("accepts PDF evidence", async () => {
    const result = await scanner.scan({ bytes: PDF, filenameHint: "certificate.pdf", purpose: "EVIDENCE" });
    expect(result.status).toBe("CLEAN");
  });
});
