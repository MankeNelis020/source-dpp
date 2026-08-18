import { getPersistence, getRuntimeRateLimiter } from "@/infrastructure/runtime";
import { jsonError, originAllowed, principalFromRequest } from "../../source/_lib";
import { clientIp, invitationTtlDays, mayExposeInviteLinks, requireCapability } from "@/server/source/principal";
import { INVITABLE_ROLES, inviteColleague, listTeam } from "@/server/source/organisations";
import type { Role } from "@/server/source/types";

export async function GET(request: Request) {
  try {
    const principal = await principalFromRequest(request);
    requireCapability(principal, "organisation:manage");
    return Response.json(await listTeam(getPersistence(), principal));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!originAllowed(request)) {
      return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    }
    const principal = await principalFromRequest(request);
    const limited = await getRuntimeRateLimiter().consume({
      key: `invite:create:${principal.organisationId}:${clientIp(request)}`,
      limit: 10,
      windowSeconds: 60,
    });
    if (!limited.allowed) {
      return Response.json({ error: "RATE_LIMITED", message: "Too many attempts. Try again shortly." }, { status: 429 });
    }
    const body = (await request.json()) as { email?: string; role?: Role };
    if (!body.email || !body.role || !INVITABLE_ROLES.includes(body.role)) {
      return Response.json({ error: "VALIDATION", message: "Enter an email and a valid role." }, { status: 400 });
    }
    const result = await inviteColleague({
      store: getPersistence(),
      principal,
      email: body.email,
      role: body.role,
      ttlDays: invitationTtlDays(),
      exposeInviteUrl: mayExposeInviteLinks(),
    });
    return Response.json({
      invitation: {
        id: result.invitation.id,
        emailNormalized: result.invitation.emailNormalized,
        role: result.invitation.role,
        expiresAt: result.invitation.expiresAt,
      },
      inviteUrl: result.inviteUrl,
    });
  } catch (error) {
    return jsonError(error);
  }
}
