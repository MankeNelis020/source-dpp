import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionCookieOptions, decodeSession } from "@/infrastructure/auth/session";
import { getPersistence } from "@/infrastructure/runtime";
import { originAllowed, jsonError } from "../../source/_lib";

export async function POST(request: Request) {
  try {
    if (!originAllowed(request)) return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    const jar = await cookies();
    const session = decodeSession(jar.get(SESSION_COOKIE)?.value);
    if (session) getPersistence().revokeSession(session.sid);
    jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
