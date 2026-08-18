import { cookies } from "next/headers";
import { getPersistence } from "@/infrastructure/runtime";
import { getIdentityProvider } from "@/infrastructure/auth/identity-factory";
import type { AuthIdentity } from "@/infrastructure/auth/identity";
import { signValue, verifySignedValue } from "@/infrastructure/crypto/tokens";
import { loadSourceEnvironment } from "@/infrastructure/environment/source-environment";
import {
  ensureSourceProfile,
  membershipSummaries,
  postAuthPath,
  resolveOrganisationPrincipal,
} from "@/server/source/organisations";
import type { Principal } from "@/server/source/types";
import { SourceError } from "@/server/source/types";
import { hasCapability, type Capability } from "@/server/source/authorization";

export const ACTIVE_ORG_COOKIE = "source_organisation";

function orgCookieSecret(): string {
  return process.env.SOURCE_SESSION_SECRET || "source-demo-session-secret-not-for-production";
}

export function encodeActiveOrganisation(userId: string, organisationId: string): string {
  return signValue(JSON.stringify({ userId, organisationId }), orgCookieSecret());
}

export function decodeActiveOrganisation(signed: string | undefined, userId: string): string | undefined {
  if (!signed) return undefined;
  const raw = verifySignedValue(signed, orgCookieSecret());
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { userId?: string; organisationId?: string };
    if (parsed.userId !== userId || !parsed.organisationId) return undefined;
    return parsed.organisationId;
  } catch {
    return undefined;
  }
}

export function cookieFromRequest(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export async function loadSessionContext(request: Request) {
  const identity = await getIdentityProvider().getAuthenticatedUser(request);
  if (!identity) {
    return { authenticated: false as const };
  }
  const store = getPersistence();
  await ensureSourceProfile(store, identity);
  const memberships = await membershipSummaries(store, identity.userId);
  const selectedOrganisationId = decodeActiveOrganisation(
    cookieFromRequest(request, ACTIVE_ORG_COOKIE),
    identity.userId
  );
  const selectedValid = memberships.some((row) => row.organisationId === selectedOrganisationId);
  let principal: Principal | undefined;
  if (identity.emailVerified && memberships.length) {
    try {
      principal = await resolveOrganisationPrincipal(
        store,
        identity,
        selectedValid ? selectedOrganisationId : undefined
      );
    } catch {
      principal = undefined;
    }
  }
  return {
    authenticated: true as const,
    identity,
    memberships,
    principal,
    nextPath: postAuthPath({
      emailVerified: identity.emailVerified,
      membershipCount: memberships.length,
      hasSelectedOrganisation: Boolean(principal),
    }),
  };
}

export async function requireAuthenticatedUser(request: Request): Promise<AuthIdentity> {
  const identity = await getIdentityProvider().getAuthenticatedUser(request);
  if (!identity) throw new SourceError("UNAUTHENTICATED", "Sign in required.", 401);
  await ensureSourceProfile(getPersistence(), identity);
  return identity;
}

export async function requireVerifiedUser(request: Request): Promise<AuthIdentity> {
  const identity = await requireAuthenticatedUser(request);
  if (!identity.emailVerified) {
    throw new SourceError("UNAUTHENTICATED", "Verify your email to continue.", 401);
  }
  return identity;
}

export async function requirePrincipal(request: Request): Promise<Principal> {
  const identity = await requireAuthenticatedUser(request);
  if (!identity.emailVerified) {
    throw new SourceError("UNAUTHENTICATED", "Verify your email to continue.", 401);
  }
  const organisationId = decodeActiveOrganisation(
    cookieFromRequest(request, ACTIVE_ORG_COOKIE),
    identity.userId
  );
  return resolveOrganisationPrincipal(getPersistence(), identity, organisationId);
}

export async function requireOrganisationPrincipal(request: Request): Promise<Principal> {
  return requirePrincipal(request);
}

export function requireCapability(principal: Principal, capability: Capability) {
  if (!hasCapability(principal, capability)) {
    throw new SourceError("FORBIDDEN", "You cannot perform this action.", 403);
  }
}

export function safeInternalPath(value: string | null | undefined, fallback = "/app"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) return fallback;
  return value;
}

export async function readActiveOrganisationCookie(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(ACTIVE_ORG_COOKIE)?.value;
}

export function activeOrganisationCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function mayExposeInviteLinks(): boolean {
  try {
    const env = loadSourceEnvironment();
    return env.runtime === "local" && process.env.SOURCE_EXPOSE_INVITE_LINKS === "1";
  } catch {
    return false;
  }
}

export function invitationTtlDays(): number {
  try {
    return loadSourceEnvironment().invitationTtlDays;
  } catch {
    return 7;
  }
}
