import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { loadSourceEnvironment } from "@/infrastructure/environment/source-environment";

export async function refreshSupabaseAuth(request: NextRequest): Promise<NextResponse> {
  const env = loadSourceEnvironment();
  let response = NextResponse.next({ request });
  if (!env.supabaseUrl || !env.supabaseAnonKey) return response;
  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        if (headers) {
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        }
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}
