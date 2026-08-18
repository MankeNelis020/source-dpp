import { jsonError, principalFromRequest } from "../../_lib";
import { getPersistence, getRuntimeEvidenceStorage } from "@/infrastructure/runtime";
import { getEvidenceAccess } from "@/server/source/queries";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await principalFromRequest();
    const { id } = await context.params;
    return Response.json(await getEvidenceAccess(getPersistence(), principal, id, getRuntimeEvidenceStorage()));
  } catch (error) {
    return jsonError(error);
  }
}
