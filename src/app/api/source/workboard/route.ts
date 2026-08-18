import { jsonError, principalFromRequest } from "../_lib";
import { getMemoryPersistence } from "@/infrastructure/database/memory";
import { getResolutionWorkboard } from "@/server/source/queries";

export async function GET() {
  try {
    const principal = await principalFromRequest();
    return Response.json(getResolutionWorkboard(getMemoryPersistence(), principal));
  } catch (error) {
    return jsonError(error);
  }
}
