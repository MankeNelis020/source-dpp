import { jsonError, originAllowed } from "@/app/api/source/_lib";
import { getPersistence, getRuntimeObjectStorage } from "@/infrastructure/runtime";
import { resolvePortalPrincipal } from "@/server/source/portal";
import { putUploadBytes } from "@/server/source/uploads";
import { consumeUploadLimit, readUploadBytes } from "@/server/source/http-upload";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ token: string; id: string }> }) {
  try {
    if (!originAllowed(request, "bearer")) {
      return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    }
    const { token, id } = await context.params;
    const store = getPersistence();
    const principal = await resolvePortalPrincipal(store, token);
    await consumeUploadLimit(principal.grantId);
    const { bytes, filename } = await readUploadBytes(request);
    const record = await putUploadBytes({
      store,
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
