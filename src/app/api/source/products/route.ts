import { jsonError, principalFromRequest } from "../_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { listCatalogueProducts } from "@/server/source/queries";

export async function GET(request: Request) {
  try {
    const principal = await principalFromRequest(request);
    return Response.json({ products: await listCatalogueProducts(getPersistence(), principal) });
  } catch (error) {
    return jsonError(error);
  }
}
