import { NextResponse, type NextRequest } from "next/server";
import { loadSourceEnvironment } from "@/infrastructure/environment/source-environment";
import { safeNextPath } from "@/lib/source/safe-next";
import {
  classifyPkceExchangeError,
  isPkceVerifierCookieName,
  logPkceExchangeFailure,
  safePkceExchangeDiagnostics,
} from "@/infrastructure/auth/supabase/pkce";
import { createRouteHandlerSupabaseClient } from "@/infrastructure/auth/supabase/route-client";

function errorRedirect(origin: string, kind: "missing_code" | "expired" | "exchange") {
  return NextResponse.redirect(new URL(`/verify-email?error=${kind}`, origin));
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"), "/app");
  const origin = url.origin;

  if (!code) {
    return errorRedirect(origin, "missing_code");
  }

  const env = loadSourceEnvironment();
  if (env.identityProvider !== "supabase") {
    return NextResponse.redirect(new URL(next, origin));
  }

  const redirectTo = NextResponse.redirect(new URL(next, origin));
  redirectTo.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");

  const hadVerifierCookie = request.cookies.getAll().some((cookie) => isPkceVerifierCookieName(cookie.name));

  try {
    const supabase = createRouteHandlerSupabaseClient(request, redirectTo);
    const flowId = url.searchParams.get("sb_flow_id");
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (!error) {
      return redirectTo;
    }

    logPkceExchangeFailure(
      safePkceExchangeDiagnostics({ error, hadVerifierCookie, runtime: env.runtime })
    );

    const existing = await supabase.auth.getUser();
    if (existing.data.user) {
      return redirectTo;
    }

    return errorRedirect(origin, classifyPkceExchangeError(error));
  } catch (error) {
    logPkceExchangeFailure(
      safePkceExchangeDiagnostics({ error, hadVerifierCookie, runtime: env.runtime })
    );
    return errorRedirect(origin, "exchange");
  }
}
