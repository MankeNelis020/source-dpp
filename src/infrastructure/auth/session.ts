import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { signValue, verifySignedValue } from "@/infrastructure/crypto/tokens";
import { demoAuthEnabled } from "@/infrastructure/runtime";

const COOKIE = "source_session";

export const DEMO_AUTH_NON_PRODUCTION = true;

function sessionSecret(): string {
  const secret = process.env.SOURCE_SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production" && process.env.SOURCE_DEMO_AUTH !== "1") {
    throw new Error("SOURCE_SESSION_SECRET is required in production. Demo session secrets are not permitted.");
  }
  return "source-demo-session-secret-not-for-production";
}

export interface SessionPayload {
  userId: string;
  organisationId: string;
  sid: string;
  exp: number;
}

export function newSessionId(): string {
  return randomBytes(16).toString("base64url");
}

export function encodeSession(payload: SessionPayload): string {
  return signValue(JSON.stringify(payload), sessionSecret());
}

export function decodeSession(signed: string | undefined): SessionPayload | null {
  if (!signed) return null;
  const raw = verifySignedValue(signed, sessionSecret());
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionPayload;
    if (parsed.exp < Date.now()) return null;
    if (!parsed.sid) return null;
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

export function assertDemoAuthAllowed() {
  if (!demoAuthEnabled()) {
    throw new Error("Demo authentication is disabled.");
  }
}

export { COOKIE as SESSION_COOKIE };
