import { jsonError, originAllowed } from "../../source/_lib";
import { getPersistence, getRuntimeRateLimiter, getRuntimeStripeBilling, getSourceEnvironment } from "@/infrastructure/runtime";
import { requireCapability, requireOrganisationPrincipal } from "@/server/source/principal";
import { requireStripeBilling, startCheckoutSession } from "@/server/source/billing";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!originAllowed(request)) {
      return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    }
    const principal = await requireOrganisationPrincipal(request);
    requireCapability(principal, "organisation:manage");
    const limited = await getRuntimeRateLimiter().consume({
      key: `billing:checkout:${principal.userId}`,
      limit: 8,
      windowSeconds: 60,
    });
    if (!limited.allowed) {
      return Response.json({ error: "RATE_LIMITED", message: "Too many attempts. Try again shortly." }, { status: 429 });
    }
    const body = (await request.json()) as { planId?: string };
    const result = await startCheckoutSession({
      store: getPersistence(),
      stripe: requireStripeBilling(getRuntimeStripeBilling()),
      env: getSourceEnvironment(),
      principal,
      email: principal.email,
      planId: body.planId ?? "",
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}