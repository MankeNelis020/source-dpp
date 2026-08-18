import { getMemoryPersistence } from "@/infrastructure/database/memory";
import { readSessionCookie } from "@/infrastructure/auth/session";
import { resolveUserPrincipal } from "@/server/source/commands/dispatch";
import { SourceError, type Principal } from "@/server/source/types";

export function jsonError(error: unknown) {
  if (error instanceof SourceError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return Response.json({ error: "ERROR", message: "Request failed." }, { status: 500 });
}

export async function principalFromRequest(): Promise<Principal> {
  const store = getMemoryPersistence();
  const session = await readSessionCookie();
  if (session) return resolveUserPrincipal(store, session.userId, session.organisationId);
  return resolveUserPrincipal(store, "user-acme-owner", "acme");
}

export function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("host");
  if (!host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
