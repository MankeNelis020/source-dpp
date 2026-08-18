import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getMemoryPersistence } from "@/infrastructure/database/memory";
import { SESSION_COOKIE, encodeSession, sessionCookieOptions } from "@/infrastructure/auth/session";
import { jsonError, originAllowed } from "../../source/_lib";
import { SlidingWindowLimiter } from "@/infrastructure/crypto/tokens";

const loginLimiter = new SlidingWindowLimiter(20);

function mapEmail(email: string) {
  const lower = email.toLowerCase();
  if (lower.includes("nordic")) return { userId: "user-nordic-owner", organisationId: "nordic" };
  if (lower.includes("reviewer")) return { userId: "user-acme-reviewer", organisationId: "acme" };
  const user = getMemoryPersistence().getUserByEmail(lower);
  if (user) {
    const membership = getMemoryPersistence().listMemberships(user.id)[0];
    if (membership) return { userId: user.id, organisationId: membership.organisationId };
  }
  return { userId: "user-acme-owner", organisationId: "acme" };
}

export async function POST(request: NextRequest) {
  try {
    if (!originAllowed(request)) return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    if (!loginLimiter.allow(request.headers.get("x-forwarded-for") ?? "local")) {
      return Response.json({ error: "RATE_LIMITED", message: "Too many sign-in attempts." }, { status: 429 });
    }
    const body = (await request.json()) as { email?: string };
    if (!body.email) return Response.json({ error: "VALIDATION", message: "email required" }, { status: 400 });
    const mapped = mapEmail(body.email);
    const jar = await cookies();
    jar.set(
      SESSION_COOKIE,
      encodeSession({ ...mapped, exp: Date.now() + 12 * 60 * 60 * 1000 }),
      sessionCookieOptions()
    );
    return Response.json({ ok: true, organisationId: mapped.organisationId });
  } catch (error) {
    return jsonError(error);
  }
}
