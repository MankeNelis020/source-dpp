import { cookies } from "next/headers";
import { signValue, verifySignedValue } from "@/infrastructure/crypto/tokens";

const COOKIE = "source_session";
const SECRET = process.env.SOURCE_SESSION_SECRET ?? "source-demo-session-secret-not-for-production";

export interface SessionPayload {
  userId: string;
  organisationId: string;
  exp: number;
}

export function encodeSession(payload: SessionPayload): string {
  return signValue(JSON.stringify(payload), SECRET);
}

export function decodeSession(signed: string | undefined): SessionPayload | null {
  if (!signed) return null;
  const raw = verifySignedValue(signed, SECRET);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionPayload;
    if (parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readSessionCookie(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return decodeSession(jar.get(COOKIE)?.value);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}

export { COOKIE as SESSION_COOKIE };
