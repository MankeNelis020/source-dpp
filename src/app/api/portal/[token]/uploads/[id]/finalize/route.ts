import { jsonError, originAllowed } from "@/app/api/source/_lib";
import { getPersistence, getRuntimeObjectStorage } from "@/infrastructure/runtime";
import { resolvePortalPrincipal } from "@/server/source/portal";
import { finalizeUpload } from "@/server/source/uploads";
import { consumeUploadLimit } from "@/server/source/http-upload";

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
    const record = await finalizeUpload({
      store,
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
