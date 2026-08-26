import { jsonError } from "../../source/_lib";
import { getPersistence, getRuntimeStripeBilling, getSourceEnvironment } from "@/infrastructure/runtime";
import { requireOrganisationPrincipal } from "@/server/source/principal";
import { organisationBillingStatus } from "@/server/source/billing";
import { stripeBillingConfigured } from "@/infrastructure/billing/factory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const principal = await requireOrganisationPrincipal(request);
    const env = getSourceEnvironment();
    const status = await organisationBillingStatus({
      store: getPersistence(),
      principal,
      billingConfigured: stripeBillingConfigured(env) || Boolean(getRuntimeStripeBilling()),
    });
    return Response.json(status);
  } catch (error) {
    return jsonError(error);
  }
}