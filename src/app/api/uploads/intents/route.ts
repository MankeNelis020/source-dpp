import { jsonError, originAllowed, principalFromRequest } from "@/app/api/source/_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { createUploadIntent } from "@/server/source/uploads";
import { consumeUploadLimit } from "@/server/source/http-upload";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!originAllowed(request)) {
      return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    }
    const principal = await principalFromRequest(request);
    await consumeUploadLimit(principal.userId);
    const body = (await request.json()) as {
      purpose?: "IMPORT_SOURCE" | "EVIDENCE";
      filename?: string;
      mimeType?: string;
      size?: number;
      caseId?: string;
      requirementId?: string;
      objectKey?: string;
      bucket?: string;
      organisationId?: string;
    };
    const intent = await createUploadIntent({
      store: getPersistence(),
      principal,
      input: {
        purpose: body.purpose ?? "EVIDENCE",
        filenameHint: body.filename,
        mimeHint: body.mimeType,
        sizeHint: body.size,
        caseId: body.caseId,
        requirementId: body.requirementId,
        objectKey: body.objectKey,
        bucket: body.bucket,
        organisationId: body.organisationId,
      },
    });
    return Response.json(intent);
  } catch (error) {
    return jsonError(error);
  }
}
