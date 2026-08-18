import { jsonError, principalFromRequest } from "../../source/_lib";
import { getMemoryPersistence } from "@/infrastructure/database/memory";
import { getImportProgress } from "@/server/source/import/service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await principalFromRequest();
    const { id } = await context.params;
    return Response.json(getImportProgress(getMemoryPersistence(), principal, id));
  } catch (error) {
    return jsonError(error);
  }
}
