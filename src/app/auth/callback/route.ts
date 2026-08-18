import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/infrastructure/auth/supabase/server";
import { getSourceEnvironment } from "@/infrastructure/runtime";
import { safeInternalPath } from "@/server/source/principal";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeInternalPath(url.searchParams.get("next"), "/app");
  const origin = url.origin;
  if (!code) {
    return NextResponse.redirect(new URL("/login", origin));
  }
  try {
    const env = getSourceEnvironment();
    if (env.identityProvider !== "supabase") {
      return NextResponse.redirect(new URL(next, origin));
    }
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL("/verify-email?error=expired", origin));
    }
    return NextResponse.redirect(new URL(next, origin));
  } catch {
    return NextResponse.redirect(new URL("/login", origin));
  }
}
