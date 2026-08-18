import { cookies } from "next/headers";
import { getIdentityProvider } from "@/infrastructure/auth/identity-factory";
import { SESSION_COOKIE, sessionCookieOptions } from "@/infrastructure/auth/session";
import { jsonError, originAllowed } from "../../source/_lib";
import { ACTIVE_ORG_COOKIE, activeOrganisationCookieOptions } from "@/server/source/principal";

export async function POST(request: Request) {
  try {
    if (!originAllowed(request)) {
      return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    }
    const provider = getIdentityProvider();
    await provider.signOut?.(request);
    const jar = await cookies();
    jar.set("source_test_identity", "", { httpOnly: true, path: "/", maxAge: 0, sameSite: "lax" });
    jar.set(ACTIVE_ORG_COOKIE, "", { ...activeOrganisationCookieOptions(), maxAge: 0 });
    jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
