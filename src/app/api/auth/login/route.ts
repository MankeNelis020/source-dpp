import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getPersistence, getRuntimeRateLimiter } from "@/infrastructure/runtime";
import { SESSION_COOKIE, encodeSession, sessionCookieOptions, newSessionId, assertDemoAuthAllowed } from "@/infrastructure/auth/session";
import { jsonError, originAllowed } from "../../source/_lib";

export async function POST(request: NextRequest) {
  try {
    assertDemoAuthAllowed();
    if (!originAllowed(request)) return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const limited = await getRuntimeRateLimiter().consume({ key: `auth:login:${ip}`, limit: 20, windowSeconds: 60 });
    if (!limited.allowed) {
      return Response.json({ error: "RATE_LIMITED", message: "Too many sign-in attempts." }, { status: 429 });
    }
    const body = (await request.json()) as { email?: string };
    if (!body.email) return Response.json({ error: "VALIDATION", message: "email required" }, { status: 400 });
    const store = getPersistence();
    const lower = body.email.toLowerCase();
    let userId = "user-acme-owner";
    let organisationId = "acme";
    if (lower.includes("nordic")) {
      userId = "user-nordic-owner";
      organisationId = "nordic";
    } else if (lower.includes("reviewer")) {
      userId = "user-acme-reviewer";
      organisationId = "acme";
    } else {
      const user = await store.getUserByEmail(lower);
      if (user) {
        const memberships = await store.listMemberships(user.id);
        const membership = memberships[0];
        if (membership) {
          userId = user.id;
          organisationId = membership.organisationId;
        }
      }
    }
    const sid = newSessionId();
    await store.saveSession({
      id: sid,
      userId,
      organisationId,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    });
    const jar = await cookies();
    jar.set(
      SESSION_COOKIE,
      encodeSession({ userId, organisationId, sid, exp: Date.now() + 12 * 60 * 60 * 1000 }),
      sessionCookieOptions()
    );
    return Response.json({ ok: true, organisationId, demoAuth: true });
  } catch (error) {
    return jsonError(error);
  }
}
