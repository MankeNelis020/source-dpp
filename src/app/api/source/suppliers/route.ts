import { jsonError, principalFromRequest } from "../_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { listCatalogueSuppliers } from "@/server/source/queries";

export async function GET(request: Request) {
  try {
    const principal = await principalFromRequest(request);
    return Response.json({ suppliers: await listCatalogueSuppliers(getPersistence(), principal) });
  } catch (error) {
    return jsonError(error);
  }
}
