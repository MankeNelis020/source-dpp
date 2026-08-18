import { jsonError, principalFromRequest } from "../../_lib";
import { getPersistence, getRuntimeObjectStorage } from "@/infrastructure/runtime";
import { getEvidenceAccess } from "@/server/source/queries";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await principalFromRequest(request);
    const { id } = await context.params;
    return Response.json(await getEvidenceAccess(getPersistence(), principal, id, getRuntimeObjectStorage()));
  } catch (error) {
    return jsonError(error);
  }
}
