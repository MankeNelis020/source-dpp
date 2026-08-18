import { jsonError, principalFromRequest } from "../_lib";
import { getMemoryPersistence } from "@/infrastructure/database/memory";
import { searchTenant } from "@/server/source/queries";

export async function GET(request: Request) {
  try {
    const principal = await principalFromRequest();
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return Response.json(searchTenant(getMemoryPersistence(), principal, q));
  } catch (error) {
    return jsonError(error);
  }
}
