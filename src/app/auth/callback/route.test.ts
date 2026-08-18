import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { createAuthCookieAdapter } from "@/infrastructure/auth/supabase/route-client";

const AUTH_CODE = "one-time-pkce-auth-code-abc";
const VERIFIER = "pkce-verifier-cookie-value";
const SESSION = "session-cookie-value";
const EMAIL = "niel@example.test";

const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();

vi.mock("@/infrastructure/environment/source-environment", () => ({
  loadSourceEnvironment: vi.fn(() => ({
    identityProvider: "supabase",
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "test-anon-key",
    runtime: "preview",
  })),
}));

vi.mock("@/infrastructure/auth/supabase/route-client", async () => {
  const actual = await vi.importActual<typeof import("@/infrastructure/auth/supabase/route-client")>(
    "@/infrastructure/auth/supabase/route-client"
  );
  return {
    ...actual,
    createRouteHandlerSupabaseClient: vi.fn((_request: NextRequest, response: NextResponse) => ({
      auth: {
        exchangeCodeForSession: async (code: string) => {
          const result = await exchangeCodeForSession(code);
          if (!result?.error) {
            const adapter = actual.createAuthCookieAdapter(_request, response);
            adapter.setAll(
              [{ name: "sb-example-auth-token", value: SESSION, options: { path: "/", sameSite: "lax" } }],
              {
                "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
              }
            );
          }
          return result;
        },
        getUser,
      },
    })),
  };
});

import { GET } from "@/app/auth/callback/route";
import { loadSourceEnvironment } from "@/infrastructure/environment/source-environment";

function callbackRequest(search: string, cookies?: Record<string, string>) {
  const headers = new Headers();
  if (cookies) {
    headers.set(
      "cookie",
      Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; ")
    );
  }
  return new NextRequest(`https://app.source.test/auth/callback${search}`, { headers });
}

describe("createAuthCookieAdapter", () => {
  it("persists exchanged session cookies on the redirect response", () => {
    const request = callbackRequest(`?code=${AUTH_CODE}`, {
      "sb-example-auth-token-code-verifier": VERIFIER,
    });
    const response = NextResponse.redirect("https://app.source.test/onboarding/organisation");
    const adapter = createAuthCookieAdapter(request, response);
    adapter.setAll([{ name: "sb-example-auth-token", value: SESSION, options: { path: "/" } }]);
    expect(response.cookies.get("sb-example-auth-token")?.value).toBe(SESSION);
    expect(adapter.getAll().some((cookie) => cookie.name.includes("code-verifier"))).toBe(true);
  });
});

describe("/auth/callback PKCE exchange", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    vi.mocked(loadSourceEnvironment).mockReturnValue({
      identityProvider: "supabase",
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "test-anon-key",
      runtime: "preview",
    } as ReturnType<typeof loadSourceEnvironment>);
  });

  it("exchanges a valid code once, persists cookies, and redirects to a safe next path", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { session: { access_token: SESSION } }, error: null });
    const response = await GET(
      callbackRequest("?code=valid-code&next=/onboarding/organisation", {
        "sb-example-auth-token-code-verifier": VERIFIER,
      })
    );
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(exchangeCodeForSession).toHaveBeenCalledWith("valid-code");
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get("location")).toBe("https://app.source.test/onboarding/organisation");
    expect(response.cookies.get("sb-example-auth-token")?.value).toBe(SESSION);
  });

  it("redirects with a useful error when the code is missing", async () => {
    const response = await GET(callbackRequest("?next=/onboarding/organisation"));
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://app.source.test/verify-email?error=missing_code");
  });

  it("treats an invalid code as an expired verification link and does not persist a session", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { status: 400, code: "validation_failed", name: "AuthApiError" },
    });
    const response = await GET(callbackRequest("?code=invalid-code"));
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe("https://app.source.test/verify-email?error=exchange");
    expect(response.cookies.get("sb-example-auth-token")).toBeUndefined();
  });

  it("maps a 422 PKCE exchange failure to the expired/used UI", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { status: 422, code: "flow_state_not_found", name: "AuthApiError" },
    });
    const response = await GET(
      callbackRequest(`?code=${AUTH_CODE}&next=/onboarding/organisation`, {
        "sb-example-auth-token-code-verifier": VERIFIER,
      })
    );
    expect(response.headers.get("location")).toBe("https://app.source.test/verify-email?error=expired");
    const blob = log.mock.calls.map((args) => JSON.stringify(args)).join(" ");
    expect(blob).toContain("auth.pkce.exchange_failed");
    expect(blob).toContain("422");
    expect(blob).not.toContain(AUTH_CODE);
    expect(blob).not.toContain(VERIFIER);
    expect(blob).not.toContain(EMAIL);
    log.mockRestore();
  });

  it("does not replay a used code into a session unless one already exists", async () => {
    exchangeCodeForSession
      .mockResolvedValueOnce({ data: { session: { access_token: SESSION } }, error: null })
      .mockResolvedValueOnce({
        data: { session: null },
        error: { status: 422, code: "flow_state_not_found", name: "AuthApiError" },
      });
    const first = await GET(callbackRequest("?code=replay-code&next=/onboarding/organisation"));
    expect(first.cookies.get("sb-example-auth-token")?.value).toBe(SESSION);

    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const second = await GET(callbackRequest("?code=replay-code&next=/onboarding/organisation"));
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(2);
    expect(second.headers.get("location")).toBe("https://app.source.test/verify-email?error=expired");
  });

  it("continues to next when a replayed code already has a session", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { status: 422, code: "flow_state_not_found", name: "AuthApiError" },
    });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const response = await GET(callbackRequest("?code=already-used&next=/onboarding/organisation"));
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe("https://app.source.test/onboarding/organisation");
  });

  it("rejects a malicious external next redirect", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { session: { access_token: SESSION } }, error: null });
    const response = await GET(
      callbackRequest("?code=valid-code&next=https://evil.example/phish")
    );
    expect(response.headers.get("location")).toBe("https://app.source.test/app");
    expect(response.headers.get("location")).not.toContain("evil.example");
  });
});
