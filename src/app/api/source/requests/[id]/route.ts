import { jsonError, principalFromRequest } from "../../_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { getRequestDetail } from "@/server/source/queries";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await principalFromRequest(request);
    const { id } = await context.params;
    return Response.json(await getRequestDetail(getPersistence(), principal, id));
  } catch (error) {
    return jsonError(error);
  }
}
