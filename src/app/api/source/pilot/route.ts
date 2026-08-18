import { jsonError, principalFromRequest } from "../../_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { getPilotResults } from "@/server/source/queries";

export async function GET() {
  try {
    const principal = await principalFromRequest();
    return Response.json(await getPilotResults(getPersistence(), principal));
  } catch (error) {
    return jsonError(error);
  }
}
