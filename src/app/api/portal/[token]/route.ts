import { getPersistence } from "@/infrastructure/runtime";
import { resolvePortalPrincipal } from "@/server/source/portal";
import { getSupplierPortalView } from "@/server/source/queries";
import { jsonError } from "../../source/_lib";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const store = getPersistence();
    const principal = await resolvePortalPrincipal(store, token);
    return Response.json(await getSupplierPortalView(store, principal));
  } catch (error) {
    return jsonError(error);
  }
}
