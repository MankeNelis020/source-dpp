import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { loadSourceEnvironment } from "@/infrastructure/environment/source-environment";

/**
 * Request-scoped server client for Server Components, Server Actions, and
 * non-callback Route Handlers. Do not reuse across requests.
 *
 * `/auth/callback` must not use this helper: `cookies().set` plus a later
 * `NextResponse.redirect()` does not persist PKCE session cookies. Use
 * `createRouteHandlerSupabaseClient` bound to the redirect response instead.
 */
export async function createServerSupabaseClient() {
  const env = loadSourceEnvironment();
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error("Supabase Auth is not configured.");
  }
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          }
        } catch {
          // Server Components cannot persist refreshed cookies; middleware does.
        }
      },
    },
  });
}
