import { jsonError, originAllowed, principalFromRequest } from "../../source/_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { executeResolutionRun } from "@/server/source/resolution-run";

export async function POST(request: Request) {
  try {
    if (!originAllowed(request)) return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    const principal = await principalFromRequest(request);
    const result = await executeResolutionRun(getPersistence(), principal);
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
