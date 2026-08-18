import { createHash } from "node:crypto";
import type { FileScanner, ScanResult, StoragePurpose } from "./port";
import { SourceError } from "@/server/source/types";

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_EVIDENCE_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 25000;
export const MAX_IMPORT_COLS = 80;
export const MAX_IMPORT_SHEETS = 20;

const DENIED_EXTENSIONS = new Set(["exe", "js", "mjs", "cjs", "html", "htm", "svg", "bat", "cmd", "com", "dll", "sh"]);

const IMPORT_EXTENSIONS = new Set(["csv", "txt", "xlsx"]);
const EVIDENCE_EXTENSIONS = new Set(["pdf", "csv", "txt", "png", "jpg", "jpeg", "xlsx", "xls"]);

export type DetectedKind = "csv" | "pdf" | "png" | "jpeg" | "xlsx" | "zip" | "html" | "executable" | "unknown";

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function extensionOf(filename: string | undefined): string {
  const base = basenameHint(filename);
  const dot = base.lastIndexOf(".");
  if (dot < 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function basenameHint(filename: string | undefined): string {
  if (!filename) return "upload";
  const trimmed = filename.replace(/\\/g, "/").split("/").pop()?.trim() || "upload";
  if (trimmed.includes("..") || trimmed.includes("\0")) return "upload";
  return trimmed.slice(0, 255);
}

export function rejectUnsafeObjectPath(value: string | undefined, label: string) {
  if (value === undefined || value === "") return;
  throw new SourceError("VALIDATION", `Client must not choose ${label}.`, 400);
}

export function detectKind(bytes: Uint8Array): DetectedKind {
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return "executable";
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "pdf";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)) {
    return "xlsx";
  }
  const head = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 256))).toString("utf8").toLowerCase();
  if (head.includes("<html") || head.includes("<!doctype html") || head.includes("<svg")) return "html";
  if (bytes.includes(0)) return "unknown";
  return "csv";
}

export function mimeForKind(kind: DetectedKind): string {
  switch (kind) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpeg":
      return "image/jpeg";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "csv":
      return "text/csv";
    default:
      return "application/octet-stream";
  }
}

export function assertAllowedUpload(input: {
  bytes: Uint8Array;
  filenameHint?: string;
  purpose: StoragePurpose;
}): { kind: DetectedKind; mimeType: string; size: number } {
  const size = input.bytes.byteLength;
  const max = input.purpose === "IMPORT_SOURCE" || input.purpose === "TEMPORARY_UPLOAD" ? MAX_IMPORT_BYTES : MAX_EVIDENCE_BYTES;
  if (input.purpose === "EVIDENCE") {
    if (size > MAX_EVIDENCE_BYTES) {
      throw new SourceError("VALIDATION", `This file exceeds the ${Math.floor(MAX_EVIDENCE_BYTES / (1024 * 1024))} MB limit.`, 400);
    }
  } else if (size > max) {
    throw new SourceError("VALIDATION", `This file exceeds the ${Math.floor(max / (1024 * 1024))} MB limit.`, 400);
  }
  const ext = extensionOf(input.filenameHint);
  if (DENIED_EXTENSIONS.has(ext)) {
    throw new SourceError("FILE_TYPE_NOT_ALLOWED", "This file type is not allowed.", 400);
  }
  const kind = detectKind(input.bytes);
  if (kind === "executable" || kind === "html") {
    throw new SourceError("FILE_TYPE_NOT_ALLOWED", "This file type is not allowed.", 400);
  }
  const allowedExt = input.purpose === "EVIDENCE" ? EVIDENCE_EXTENSIONS : IMPORT_EXTENSIONS;
  if (ext && !allowedExt.has(ext) && ext !== "bin") {
    throw new SourceError("FILE_TYPE_NOT_ALLOWED", "This file type is not allowed.", 400);
  }
  if (input.purpose === "EVIDENCE") {
    if (!["pdf", "csv", "png", "jpeg", "xlsx"].includes(kind)) {
      throw new SourceError("FILE_TYPE_NOT_ALLOWED", "This file type is not allowed.", 400);
    }
  } else if (input.purpose === "IMPORT_SOURCE" || input.purpose === "TEMPORARY_UPLOAD") {
    if (!["csv", "xlsx"].includes(kind)) {
      throw new SourceError("FILE_TYPE_NOT_ALLOWED", "Import files must be CSV (XLSX is stored but not processed in this pilot).", 400);
    }
  }
  if (kind === "xlsx") {
    assertZipBombBudget(input.bytes);
  }
  if (kind === "csv" && input.bytes.includes(0)) {
    throw new SourceError("VALIDATION", "This file is malformed.", 400);
  }
  return { kind, mimeType: mimeForKind(kind), size };
}

/**
 * Cheap zip-bomb guard: reject oversized compressed streams and excessive local-file headers.
 * Not a full unzip. XLSX is ZIP; we do not expand worksheets here.
 */
export function assertZipBombBudget(bytes: Uint8Array) {
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    throw new SourceError("VALIDATION", "This spreadsheet is too large to process.", 400);
  }
  let localHeaders = 0;
  for (let i = 0; i + 4 < bytes.length; i += 1) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04) {
      localHeaders += 1;
      if (localHeaders > 200) {
        throw new SourceError("VALIDATION", "This spreadsheet has too many internal files.", 400);
      }
      if (i + 30 <= bytes.length) {
        const uncompressed = bytes[i + 22] | (bytes[i + 23] << 8) | (bytes[i + 24] << 16) | (bytes[i + 25] << 24);
        if (uncompressed > MAX_IMPORT_BYTES * 4) {
          throw new SourceError("VALIDATION", "This spreadsheet expands beyond the safe size limit.", 400);
        }
      }
    }
  }
}

/**
 * Allowlist + magic-byte scanner. This is not a malware vendor.
 * Production residual risk: no antivirus/content sandbox beyond type allowlisting.
 */
export class AllowlistFileScanner implements FileScanner {
  readonly productionGrade = false;
  readonly label = "allowlist-magic-bytes-not-antivirus";

  async scan(input: {
    bytes: Uint8Array;
    declaredMime?: string;
    filenameHint?: string;
    purpose: StoragePurpose;
  }): Promise<ScanResult> {
    try {
      const checked = assertAllowedUpload(input);
      return { status: "CLEAN", detectedMime: checked.mimeType };
    } catch (error) {
      if (error instanceof SourceError && error.code === "FILE_TYPE_NOT_ALLOWED") {
        return { status: "REJECTED", reason: error.message };
      }
      if (error instanceof SourceError) {
        return { status: "REJECTED", reason: error.message };
      }
      return { status: "FAILED", reason: "File could not be scanned." };
    }
  }
}

export function defaultFileScanner(): FileScanner {
  return new AllowlistFileScanner();
}
