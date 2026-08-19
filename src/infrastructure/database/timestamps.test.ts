import { describe, expect, it } from "vitest";
import {
  TimestampEncodingError,
  normalizeTimestamp,
  requireTimestamp,
} from "@/infrastructure/database/timestamps";
import { mapStorageObject, storageObjectWriteTimestamps } from "@/infrastructure/database/postgres";

const ISO = "2026-08-19T04:27:19.000Z";
const JS_DATE_STRING = "Wed Aug 19 2026 04:27:19 GMT+0000 (Coordinated Universal Time)";

describe("normalizeTimestamp", () => {
  it("returns null for missing nullable values", () => {
    expect(normalizeTimestamp(null)).toBeNull();
    expect(normalizeTimestamp(undefined)).toBeNull();
    expect(normalizeTimestamp("")).toBeNull();
  });

  it("converts Date objects with toISOString", () => {
    expect(normalizeTimestamp(new Date(ISO))).toBe(ISO);
    expect(normalizeTimestamp(new Date(ISO))).not.toBe(JS_DATE_STRING);
    expect(normalizeTimestamp(new Date(ISO))).not.toMatch(/Wed Aug/);
  });

  it("keeps valid ISO 8601 strings unchanged", () => {
    expect(normalizeTimestamp(ISO)).toBe(ISO);
    expect(normalizeTimestamp("2026-08-19T04:27:19+00:00")).toBe("2026-08-19T04:27:19+00:00");
  });

  it("rejects JavaScript Date.toString() and other malformed values", () => {
    expect(() => normalizeTimestamp(JS_DATE_STRING)).toThrow(TimestampEncodingError);
    expect(() => normalizeTimestamp("not-a-timestamp")).toThrow(TimestampEncodingError);
    expect(() => normalizeTimestamp("2026-08-19")).toThrow(TimestampEncodingError);
    expect(() => normalizeTimestamp(new Date(Number.NaN))).toThrow(TimestampEncodingError);
    expect(() => requireTimestamp(undefined)).toThrow(TimestampEncodingError);
  });
});

describe("storage object timestamp mapping", () => {
  it("maps node-pg Date createdAt to ISO and never String(date)", () => {
    const mapped = mapStorageObject({
      id: "so-1",
      organisation_id: "org-1",
      bucket: "source-imports",
      object_key: "t/abc",
      purpose: "TEMPORARY_UPLOAD",
      availability: "UPLOADING",
      original_filename: "products.csv",
      scan_status: "PENDING",
      created_at: new Date(ISO),
      expires_at: new Date("2026-08-20T04:27:19.000Z"),
      deleted_at: null,
      finalized_at: null,
    });
    expect(mapped.createdAt).toBe(ISO);
    expect(mapped.expiresAt).toBe("2026-08-20T04:27:19.000Z");
    expect(mapped.deletedAt).toBeUndefined();
    expect(mapped.finalizedAt).toBeUndefined();
    expect(mapped.createdAt).not.toBe(String(new Date(ISO)));
    expect(mapped.createdAt).not.toMatch(/Wed Aug|Coordinated Universal Time/);
  });

  it("keeps existing ISO-string storage rows unchanged", () => {
    const mapped = mapStorageObject({
      id: "so-2",
      organisationId: "org-1",
      bucket: "source-imports",
      objectKey: "t/abc",
      purpose: "IMPORT_SOURCE",
      availability: "AVAILABLE",
      originalFilename: "products.csv",
      scanStatus: "CLEAN",
      createdAt: ISO,
      expiresAt: undefined,
      deletedAt: undefined,
      finalizedAt: ISO,
    });
    expect(mapped.createdAt).toBe(ISO);
    expect(mapped.finalizedAt).toBe(ISO);
  });
});

describe("storageObjectWriteTimestamps", () => {
  it("accepts Date createdAt and emits ISO for every timestamptz field", () => {
    const params = storageObjectWriteTimestamps({
      createdAt: new Date(ISO),
      expiresAt: new Date("2026-08-20T04:27:19.000Z"),
      deletedAt: new Date("2026-08-21T04:27:19.000Z"),
      finalizedAt: new Date("2026-08-19T05:00:00.000Z"),
    });
    expect(params).toEqual({
      expiresAt: "2026-08-20T04:27:19.000Z",
      deletedAt: "2026-08-21T04:27:19.000Z",
      createdAt: ISO,
      finalizedAt: "2026-08-19T05:00:00.000Z",
    });
    expect(Object.values(params).join(" ")).not.toMatch(/Wed Aug|GMT\+0000/);
  });

  it("sends SQL NULL for missing nullable timestamps", () => {
    expect(
      storageObjectWriteTimestamps({
        createdAt: ISO,
        expiresAt: undefined,
        deletedAt: null,
        finalizedAt: undefined,
      })
    ).toEqual({
      expiresAt: null,
      deletedAt: null,
      createdAt: ISO,
      finalizedAt: null,
    });
  });

  it("fails safely on malformed createdAt instead of sending Date.toString()", () => {
    expect(() => storageObjectWriteTimestamps({ createdAt: JS_DATE_STRING })).toThrow(TimestampEncodingError);
  });
});
