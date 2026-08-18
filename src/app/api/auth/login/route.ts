import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { getPersistence, getRuntimeRateLimiter, getSourceEnvironment } from "@/infrastructure/runtime";
import { TEST_IDENTITY_HEADER } from "@/infrastructure/auth/identity";
import { jsonError, originAllowed } from "../../source/_lib";
import {
  ACTIVE_ORG_COOKIE,
  activeOrganisationCookieOptions,
  clientIp,
  encodeActiveOrganisation,
} from "@/server/source/principal";
import { ensureSourceProfile, membershipSummaries, normalizeEmail } from "@/server/source/organisations";

const TEST_IDENTITY_COOKIE = "source_test_identity";

function testUserId(email: string) {
  return `user-${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;
}

function testCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}

export async function POST(request: Request) {
  try {
    if (!originAllowed(request)) {
      return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    }
    const env = getSourceEnvironment();
    if (env.identityProvider !== "test") {
      return Response.json(
        { error: "VALIDATION", message: "Sign in from the login page." },
        { status: 400 }
      );
    }
    const limited = await getRuntimeRateLimiter().consume({
      key: `auth:login:${clientIp(request)}`,
      limit: 20,
      windowSeconds: 60,
    });
    if (!limited.allowed) {
      return Response.json({ error: "RATE_LIMITED", message: "Too many attempts. Try again shortly." }, { status: 429 });
    }
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email ? normalizeEmail(body.email) : "";
    if (!email.includes("@") || !body.password || body.password.length < 8) {
      return Response.json(
        { error: "UNAUTHENTICATED", message: "We couldn't sign you in. Check your email and password." },
        { status: 401 }
      );
    }
    const store = getPersistence();
    const existing = await store.getUserByEmail(email);
    const identity = {
      userId: existing?.id ?? testUserId(email),
      email,
      emailVerified: true,
      displayName: existing?.displayName,
      authenticationMethod: "TEST" as const,
    };
    await ensureSourceProfile(store, identity);
    const memberships = await membershipSummaries(store, identity.userId);
    const jar = await cookies();
    jar.set(TEST_IDENTITY_COOKIE, JSON.stringify(identity), testCookieOptions());
    if (memberships.length === 1) {
      jar.set(
        ACTIVE_ORG_COOKIE,
        encodeActiveOrganisation(identity.userId, memberships[0].organisationId),
        activeOrganisationCookieOptions()
      );
    }
    return Response.json({
      ok: true,
      identityProvider: "test",
      header: TEST_IDENTITY_HEADER,
    });
  } catch (error) {
    return jsonError(error);
  }
}
