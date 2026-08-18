import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionCookieOptions } from "@/infrastructure/auth/session";

export async function POST() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return Response.json({ ok: true });
}
