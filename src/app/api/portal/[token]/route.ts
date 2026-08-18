import { getMemoryPersistence } from "@/infrastructure/database/memory";
import { resolvePortalPrincipal } from "@/server/source/portal";
import { getSupplierPortalView } from "@/server/source/queries";
import { jsonError } from "../../source/_lib";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const store = getMemoryPersistence();
    const principal = resolvePortalPrincipal(store, token);
    return Response.json(getSupplierPortalView(store, principal));
  } catch (error) {
    return jsonError(error);
  }
}
