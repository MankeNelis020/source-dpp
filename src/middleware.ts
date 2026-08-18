import { NextResponse, type NextRequest } from "next/server";
import { refreshSupabaseAuth, shouldRefreshSupabaseAuth } from "@/infrastructure/auth/supabase/middleware";
import { loadSourceEnvironment } from "@/infrastructure/environment/source-environment";
import { isSupabaseSessionCookieName } from "@/infrastructure/auth/supabase/pkce";

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/auth/callback",
  "/invitations",
  "/privacy",
  "/terms",
  "/security",
  "/s/",
  "/api/portal/",
  "/api/health",
  "/api/auth/",
  "/api/session",
  "/api/webhooks/",
  "/api/internal/",
];

function isPublicPath(pathname: string) {
  if (pathname === "/" || pathname === "/s") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(prefix));
}

function hasAuthHint(request: NextRequest) {
  if (request.cookies.get("source_test_identity")?.value) return true;
  return request.cookies.getAll().some((cookie) => isSupabaseSessionCookieName(cookie.name));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  try {
    const env = loadSourceEnvironment();
    if (env.identityProvider === "supabase" && shouldRefreshSupabaseAuth(request.nextUrl.pathname)) {
      response = await refreshSupabaseAuth(request);
    }
  } catch {
    response = NextResponse.next({ request });
  }

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/app") && !hasAuthHint(request) && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
