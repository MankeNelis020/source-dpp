import { jsonError, originAllowed } from "@/app/api/source/_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { resolvePortalPrincipal } from "@/server/source/portal";
import { createUploadIntent } from "@/server/source/uploads";
import { consumeUploadLimit } from "@/server/source/http-upload";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    if (!originAllowed(request, "bearer")) {
      return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    }
    const { token } = await context.params;
    const store = getPersistence();
    const principal = await resolvePortalPrincipal(store, token);
    await consumeUploadLimit(principal.grantId);
    const body = (await request.json()) as {
      filename?: string;
      mimeType?: string;
      size?: number;
      caseId?: string;
      requirementId?: string;
      objectKey?: string;
      bucket?: string;
      organisationId?: string;
      purpose?: string;
    };
    const intent = await createUploadIntent({
      store,
      principal,
      input: {
        purpose: "EVIDENCE",
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
