import { getRuntimeRateLimiter } from "@/infrastructure/runtime";
import { SourceError } from "@/server/source/types";
import { MAX_EVIDENCE_BYTES, MAX_IMPORT_BYTES } from "@/infrastructure/storage/files";

export async function consumeUploadLimit(subject: string) {
  const result = await getRuntimeRateLimiter().consume({
    key: `upload:${subject}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!result.allowed) {
    throw new SourceError("RATE_LIMITED", "Too many upload attempts.", 429);
  }
}

export async function readUploadBytes(request: Request): Promise<{ bytes: Uint8Array; filename?: string }> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_IMPORT_BYTES + 1024 * 1024) {
    throw new SourceError(
      "VALIDATION",
      `This file exceeds the ${Math.floor(MAX_EVIDENCE_BYTES / (1024 * 1024))} MB limit.`,
      400
    );
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new SourceError("VALIDATION", "A file is required.", 400);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { bytes, filename: file.name };
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  return { bytes, filename: request.headers.get("x-source-filename") ?? undefined };
}
