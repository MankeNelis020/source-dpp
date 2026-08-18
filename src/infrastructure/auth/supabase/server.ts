import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { loadSourceEnvironment } from "@/infrastructure/environment/source-environment";

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
      setAll(cookiesToSet, _headers) {
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          }
        } catch {
          // Server Components cannot always persist refreshed cookies; middleware does.
        }
      },
    },
  });
}
