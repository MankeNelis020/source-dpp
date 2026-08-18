import { jsonError, principalFromRequest } from "../../source/_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { getImportProgress } from "@/server/source/import/service";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await principalFromRequest(request);
    const { id } = await context.params;
    return Response.json(await getImportProgress(getPersistence(), principal, id));
  } catch (error) {
    return jsonError(error);
  }
}
