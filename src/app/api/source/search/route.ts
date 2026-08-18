import { jsonError, principalFromRequest } from "../_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { searchTenant } from "@/server/source/queries";

export async function GET(request: Request) {
  try {
    const principal = await principalFromRequest(request);
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return Response.json(await searchTenant(getPersistence(), principal, q));
  } catch (error) {
    return jsonError(error);
  }
}
