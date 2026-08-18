import { jsonError, originAllowed, principalFromRequest } from "@/app/api/source/_lib";
import { getPersistence, getRuntimeObjectStorage } from "@/infrastructure/runtime";
import { finalizeUpload } from "@/server/source/uploads";
import { consumeUploadLimit } from "@/server/source/http-upload";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!originAllowed(request)) {
      return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    }
    const principal = await principalFromRequest(request);
    await consumeUploadLimit(principal.userId);
    const { id } = await context.params;
    const record = await finalizeUpload({
      store: getPersistence(),
      principal,
      uploadId: id,
      objectStorage: getRuntimeObjectStorage(),
    });
    return Response.json({
      id: record.id,
      purpose: record.purpose,
      availability: record.availability,
      sha256: record.sha256,
      sizeBytes: record.sizeBytes,
      evidenceId: record.evidenceId,
    });
  } catch (error) {
    return jsonError(error);
  }
}
