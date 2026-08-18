import { jsonError, principalFromRequest } from "../../_lib";
import { getMemoryPersistence } from "@/infrastructure/database/memory";
import { getCaseDetail } from "@/server/source/queries";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await principalFromRequest();
    const { id } = await context.params;
    return Response.json(getCaseDetail(getMemoryPersistence(), principal, id));
  } catch (error) {
    return jsonError(error);
  }
}
