import { getPersistence } from "@/infrastructure/runtime";
import { jsonError, principalFromRequest } from "../../source/_lib";
import { requireCapability } from "@/server/source/principal";
import { listTeam } from "@/server/source/organisations";

export async function GET(request: Request) {
  try {
    const principal = await principalFromRequest(request);
    requireCapability(principal, "organisation:manage");
    return Response.json(await listTeam(getPersistence(), principal));
  } catch (error) {
    return jsonError(error);
  }
}
