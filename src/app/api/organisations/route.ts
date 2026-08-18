import { cookies } from "next/headers";
import { getPersistence, getRuntimeRateLimiter } from "@/infrastructure/runtime";
import { jsonError, originAllowed } from "../source/_lib";
import {
  ACTIVE_ORG_COOKIE,
  activeOrganisationCookieOptions,
  encodeActiveOrganisation,
  loadSessionContext,
  requireVerifiedUser,
} from "@/server/source/principal";
import { createOrganisationForIdentity } from "@/server/source/organisations";

export async function GET(request: Request) {
  try {
    const session = await loadSessionContext(request);
    if (!session.authenticated) {
      return Response.json({ error: "UNAUTHENTICATED", message: "Sign in required." }, { status: 401 });
    }
    return Response.json({ memberships: session.memberships, organisationId: session.principal?.organisationId });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!originAllowed(request)) {
      return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    }
    const identity = await requireVerifiedUser(request);
    const limited = await getRuntimeRateLimiter().consume({
      key: `org:create:${identity.userId}`,
      limit: 5,
      windowSeconds: 60,
    });
    if (!limited.allowed) {
      return Response.json({ error: "RATE_LIMITED", message: "Too many attempts. Try again shortly." }, { status: 429 });
    }
    const body = (await request.json()) as {
      name?: string;
      country?: string;
      website?: string;
      idempotencyKey?: string;
    };
    if (!body.name?.trim() || !body.country?.trim()) {
      return Response.json({ error: "VALIDATION", message: "Company name and country are required." }, { status: 400 });
    }
    const result = await createOrganisationForIdentity({
      store: getPersistence(),
      identity,
      name: body.name,
      country: body.country,
      website: body.website,
      idempotencyKey: body.idempotencyKey?.trim() || crypto.randomUUID(),
    });
    const jar = await cookies();
    jar.set(
      ACTIVE_ORG_COOKIE,
      encodeActiveOrganisation(identity.userId, result.organisation.id),
      activeOrganisationCookieOptions()
    );
    return Response.json({
      organisation: {
        id: result.organisation.id,
        name: result.organisation.name,
        slug: result.organisation.slug,
        country: result.organisation.country,
        website: result.organisation.website,
      },
      alreadyProcessed: result.alreadyProcessed,
    });
  } catch (error) {
    return jsonError(error);
  }
}
