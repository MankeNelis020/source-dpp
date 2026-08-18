import { getPersistence } from "@/infrastructure/runtime";
import { readSessionCookie } from "@/infrastructure/auth/session";
import { resolveUserPrincipal } from "@/server/source/commands/dispatch";
import { SourceError, type Principal } from "@/server/source/types";
import { demoAuthEnabled } from "@/infrastructure/runtime";
export { originAllowed } from "@/server/source/http-security";

export function jsonError(error: unknown) {
  if (error instanceof SourceError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return Response.json({ error: "ERROR", message: "Request failed." }, { status: 500 });
}

export async function principalFromRequest(): Promise<Principal> {
  const store = getPersistence();
  const session = await readSessionCookie();
  if (session) {
    const record = await store.getSession(session.sid);
    if (record?.revokedAt) throw new SourceError("UNAUTHENTICATED", "Sign in required.", 401);
    return await resolveUserPrincipal(store, session.userId, session.organisationId);
  }
  if (demoAuthEnabled()) {
    return await resolveUserPrincipal(store, "user-acme-owner", "acme");
  }
  throw new SourceError("UNAUTHENTICATED", "Sign in required.", 401);
}
