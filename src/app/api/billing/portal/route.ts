import { jsonError, originAllowed } from "../../source/_lib";
import { getPersistence, getRuntimeStripeBilling, getSourceEnvironment } from "@/infrastructure/runtime";
import { requireCapability, requireOrganisationPrincipal } from "@/server/source/principal";
import { requireStripeBilling, startCustomerPortalSession } from "@/server/source/billing";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!originAllowed(request)) {
      return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    }
    const principal = await requireOrganisationPrincipal(request);
    requireCapability(principal, "organisation:manage");
    const result = await startCustomerPortalSession({
      store: getPersistence(),
      stripe: requireStripeBilling(getRuntimeStripeBilling()),
      env: getSourceEnvironment(),
      principal,
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}