import { jsonError, principalFromRequest } from "../_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { getWorkspaceOverview } from "@/server/source/queries";

export async function GET() {
  try {
    const principal = await principalFromRequest();
    return Response.json(await getWorkspaceOverview(getPersistence(), principal));
  } catch (error) {
    return jsonError(error);
  }
}
