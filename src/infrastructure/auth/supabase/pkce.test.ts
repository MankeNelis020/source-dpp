import { describe, expect, it } from "vitest";
import {
  classifyPkceExchangeError,
  classifySupabaseAuthError,
  isAuthCallbackPath,
  isPkceVerifierCookieName,
  isSupabaseSessionCookieName,
  resendAuthErrorMessage,
  safePkceExchangeDiagnostics,
  signupAuthErrorMessage,
  verifyEmailErrorMessage,
} from "@/infrastructure/auth/supabase/pkce";

const AUTH_CODE = "pkce-auth-code-should-never-be-logged";
const VERIFIER = "pkce-code-verifier-should-never-be-logged";
const EMAIL = "niel@example.test";
const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiJ9.payload.signature";

describe("PKCE path and cookie helpers", () => {
  it("identifies the auth callback path", () => {
    expect(isAuthCallbackPath("/auth/callback")).toBe(true);
    expect(isAuthCallbackPath("/auth/callback/")).toBe(true);
    expect(isAuthCallbackPath("/login")).toBe(false);
    expect(isAuthCallbackPath("/app")).toBe(false);
  });

  it("does not treat PKCE verifier cookies as a session", () => {
    expect(isPkceVerifierCookieName("sb-ref-auth-token-code-verifier")).toBe(true);
    expect(isPkceVerifierCookieName("sb-ref-auth-token-flow-abc12345-code-verifier")).toBe(true);
    expect(isSupabaseSessionCookieName("sb-ref-auth-token")).toBe(true);
    expect(isSupabaseSessionCookieName("sb-ref-auth-token.0")).toBe(true);
    expect(isSupabaseSessionCookieName("sb-ref-auth-token-code-verifier")).toBe(false);
  });
});

describe("signup and resend UI error state", () => {
  it("shows a 429 rate-limit message and does not claim the inbox was checked", () => {
    const error = { status: 429, code: "over_email_send_rate_limit", name: "AuthApiError" };
    expect(classifySupabaseAuthError(error)).toBe("rate_limited");
    expect(signupAuthErrorMessage(error)).toBe("Too many emails sent. Wait a few minutes and try again.");
    expect(resendAuthErrorMessage(error)).toBe("Too many emails sent. Wait a few minutes and try again.");
    expect(signupAuthErrorMessage(error)).not.toMatch(/inbox|sent another/i);
    expect(resendAuthErrorMessage(error)).not.toMatch(/inbox|sent another/i);
  });

  it("keeps a generic failure when signup is not rate limited", () => {
    const error = { status: 400, code: "signup_disabled", name: "AuthApiError" };
    expect(signupAuthErrorMessage(error)).toBe("We couldn't create the account. Try again.");
  });
});

describe("422 exchange UI state", () => {
  it("maps PKCE 422 and used/expired flow states to the expired verification copy", () => {
    expect(classifyPkceExchangeError({ status: 422, code: "flow_state_not_found", name: "AuthApiError" })).toBe(
      "expired"
    );
    expect(verifyEmailErrorMessage("expired")).toMatch(/expired or already been used/i);
  });

  it("maps a missing verifier to a same-device exchange message", () => {
    expect(
      classifyPkceExchangeError({
        status: 400,
        code: "pkce_code_verifier_not_found",
        name: "AuthPKCECodeVerifierMissingError",
      })
    ).toBe("exchange");
    expect(verifyEmailErrorMessage("exchange")).toMatch(/same device/i);
  });
});

describe("PKCE diagnostics", () => {
  it("logs allow-listed fields and never includes code, verifier, cookies, tokens, or email", () => {
    const diagnostics = safePkceExchangeDiagnostics({
      error: {
        status: 422,
        code: "flow_state_not_found",
        name: "AuthApiError",
        message: `exchange failed code=${AUTH_CODE} verifier=${VERIFIER} email=${EMAIL} token=${ACCESS_TOKEN}`,
      },
      hadVerifierCookie: true,
      runtime: "preview",
    });
    const blob = JSON.stringify(diagnostics);
    expect(diagnostics).toEqual({
      event: "auth.pkce.exchange_failed",
      statusCode: 422,
      errorName: "AuthApiError",
      authErrorCode: "flow_state_not_found",
      hadVerifierCookie: true,
      runtime: "preview",
    });
    expect(blob).not.toContain(AUTH_CODE);
    expect(blob).not.toContain(VERIFIER);
    expect(blob).not.toContain(EMAIL);
    expect(blob).not.toContain(ACCESS_TOKEN);
    expect(blob).not.toContain("cookie");
  });
});
