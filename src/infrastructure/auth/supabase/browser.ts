import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser PKCE client. `createBrowserClient` already singletons in the
 * browser; do not wrap this in a module-level cache. Server clients must
 * stay request-scoped and must not use this helper.
 */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase Auth is not configured.");
  }
  return createBrowserClient(url, key);
}
