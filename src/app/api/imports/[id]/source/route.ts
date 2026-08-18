import { jsonError, principalFromRequest } from "../../../source/_lib";
import { getPersistence, getRuntimeObjectStorage, getSourceEnvironment } from "@/infrastructure/runtime";
import { hasCapability } from "@/server/source/authorization";
import { SourceError } from "@/server/source/types";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await principalFromRequest(request);
    if (!hasCapability(principal, "import:manage")) {
      throw new SourceError("FORBIDDEN", "You cannot perform this action.", 403);
    }
    const { id } = await context.params;
    const part = new URL(request.url).searchParams.get("part") ?? "products";
    const job = await getPersistence().getImportJob(id);
    if (!job || job.organisationId !== principal.organisationId) {
      throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
    }
    const storageId =
      job.sourceStorageObjectIds?.[part as keyof NonNullable<typeof job.sourceStorageObjectIds>];
    if (!storageId) {
      throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
    }
    const object = await getPersistence().getStorageObject(storageId);
    if (!object || object.organisationId !== principal.organisationId) {
      throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
    }
    const ttl = getSourceEnvironment().signedReadTtlSeconds;
    const signed = await getRuntimeObjectStorage().createSignedRead({
      bucket: object.bucket,
      key: object.objectKey,
      ttlSeconds: ttl,
    });
    return Response.json({
      url: signed.url,
      expiresAt: signed.expiresAt,
      filename: object.originalFilename,
      sizeBytes: object.sizeBytes,
    });
  } catch (error) {
    return jsonError(error);
  }
}
