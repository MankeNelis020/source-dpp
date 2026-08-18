import { jsonError, originAllowed, principalFromRequest } from "@/app/api/source/_lib";
import { getPersistence, getRuntimeObjectStorage } from "@/infrastructure/runtime";
import { putUploadBytes } from "@/server/source/uploads";
import { consumeUploadLimit, readUploadBytes } from "@/server/source/http-upload";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!originAllowed(request)) {
      return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    }
    const principal = await principalFromRequest(request);
    await consumeUploadLimit(principal.userId);
    const { id } = await context.params;
    const { bytes, filename } = await readUploadBytes(request);
    const record = await putUploadBytes({
      store: getPersistence(),
      principal,
      uploadId: id,
      bytes,
      filenameHint: filename,
      objectStorage: getRuntimeObjectStorage(),
    });
    return Response.json({
      id: record.id,
      availability: record.availability,
      sizeBytes: record.sizeBytes,
      sha256: record.sha256,
    });
  } catch (error) {
    return jsonError(error);
  }
}
