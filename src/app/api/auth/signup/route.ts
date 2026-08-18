import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { getPersistence, getRuntimeRateLimiter, getSourceEnvironment } from "@/infrastructure/runtime";
import { jsonError, originAllowed } from "../../source/_lib";
import { clientIp } from "@/server/source/principal";
import { ensureSourceProfile, normalizeEmail } from "@/server/source/organisations";

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
        { error: "VALIDATION", message: "Create your account from the signup page." },
        { status: 400 }
      );
    }
    const limited = await getRuntimeRateLimiter().consume({
      key: `auth:signup:${clientIp(request)}`,
      limit: 10,
      windowSeconds: 60,
    });
    if (!limited.allowed) {
      return Response.json({ error: "RATE_LIMITED", message: "Too many attempts. Try again shortly." }, { status: 429 });
    }
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email ? normalizeEmail(body.email) : "";
    if (!email.includes("@") || !body.password || body.password.length < 8) {
      return Response.json({ error: "VALIDATION", message: "Enter a work email and password." }, { status: 400 });
    }
    const store = getPersistence();
    const existing = await store.getUserByEmail(email);
    const identity = {
      userId: existing?.id ?? testUserId(email),
      email,
      emailVerified: true,
      authenticationMethod: "TEST" as const,
    };
    await ensureSourceProfile(store, identity);
    const jar = await cookies();
    jar.set(TEST_IDENTITY_COOKIE, JSON.stringify(identity), testCookieOptions());
    return Response.json({ ok: true, needsVerification: false });
  } catch (error) {
    return jsonError(error);
  }
}
