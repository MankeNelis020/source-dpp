import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { loadSourceEnvironment } from "@/infrastructure/environment/source-environment";

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

/**
 * Cookie adapter for Route Handlers that must persist auth cookies on the
 * outgoing response (PKCE `exchangeCodeForSession` on `/auth/callback`).
 * `cookies()` from `next/headers` plus a later `NextResponse.redirect()`
 * drops Set-Cookie on the redirect in this App Router setup.
 */
export function createAuthCookieAdapter(request: NextRequest, response: NextResponse) {
  return {
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookiesToSet: CookieToSet[], headers?: Record<string, string>) {
      for (const cookie of cookiesToSet) {
        request.cookies.set(cookie.name, cookie.value);
        response.cookies.set(cookie.name, cookie.value, cookie.options);
      }
      if (headers) {
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      }
    },
  };
}

export function createRouteHandlerSupabaseClient(request: NextRequest, response: NextResponse) {
  const env = loadSourceEnvironment();
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error("Supabase Auth is not configured.");
  }
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: createAuthCookieAdapter(request, response),
  });
}
