import { jsonError, principalFromRequest } from "@/app/api/source/_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { getEvidenceLibrary } from "@/server/source/queries";

export async function GET(request: Request) {
  try {
    const principal = await principalFromRequest(request);
    return Response.json({ items: await getEvidenceLibrary(getPersistence(), principal) });
  } catch (error) {
    return jsonError(error);
  }
}
