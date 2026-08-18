import { cookies } from "next/headers";
import { getPersistence, getRuntimeRateLimiter } from "@/infrastructure/runtime";
import { jsonError, originAllowed } from "../../source/_lib";
import {
  ACTIVE_ORG_COOKIE,
  activeOrganisationCookieOptions,
  clientIp,
  encodeActiveOrganisation,
  requireVerifiedUser,
} from "@/server/source/principal";
import { acceptInvitation } from "@/server/source/organisations";

export async function POST(request: Request) {
  try {
    if (!originAllowed(request)) {
      return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    }
    const identity = await requireVerifiedUser(request);
    const limited = await getRuntimeRateLimiter().consume({
      key: `invite:accept:${clientIp(request)}`,
      limit: 20,
      windowSeconds: 60,
    });
    if (!limited.allowed) {
      return Response.json({ error: "RATE_LIMITED", message: "Too many attempts. Try again shortly." }, { status: 429 });
    }
    const body = (await request.json()) as { token?: string };
    if (!body.token) {
      return Response.json({ error: "VALIDATION", message: "Invitation token required." }, { status: 400 });
    }
    const principal = await acceptInvitation({
      store: getPersistence(),
      identity,
      rawToken: body.token,
    });
    const jar = await cookies();
    jar.set(
      ACTIVE_ORG_COOKIE,
      encodeActiveOrganisation(principal.userId, principal.organisationId),
      activeOrganisationCookieOptions()
    );
    return Response.json({
      ok: true,
      organisationId: principal.organisationId,
      role: principal.roles[0],
    });
  } catch (error) {
    return jsonError(error);
  }
}
