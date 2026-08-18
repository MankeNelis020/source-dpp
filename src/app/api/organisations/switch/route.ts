import { cookies } from "next/headers";
import { getPersistence } from "@/infrastructure/runtime";
import { jsonError, originAllowed } from "../../source/_lib";
import {
  ACTIVE_ORG_COOKIE,
  activeOrganisationCookieOptions,
  encodeActiveOrganisation,
  requireVerifiedUser,
} from "@/server/source/principal";
import { activeMembershipsForIdentity } from "@/server/source/organisations";
import { SourceError } from "@/server/source/types";

export async function POST(request: Request) {
  try {
    if (!originAllowed(request)) {
      return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    }
    const identity = await requireVerifiedUser(request);
    const body = (await request.json()) as { organisationId?: string };
    if (!body.organisationId) {
      return Response.json({ error: "VALIDATION", message: "Select an organisation." }, { status: 400 });
    }
    const memberships = await activeMembershipsForIdentity(getPersistence(), identity.userId);
    const allowed = memberships.find((row) => row.organisationId === body.organisationId);
    if (!allowed) {
      throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
    }
    const jar = await cookies();
    jar.set(
      ACTIVE_ORG_COOKIE,
      encodeActiveOrganisation(identity.userId, allowed.organisationId),
      activeOrganisationCookieOptions()
    );
    return Response.json({ ok: true, organisationId: allowed.organisationId });
  } catch (error) {
    return jsonError(error);
  }
}
