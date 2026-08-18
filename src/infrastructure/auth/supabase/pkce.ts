export type PkceUserErrorKind = "expired" | "exchange" | "missing_code" | "rate_limited";

export interface ParsedAuthError {
  statusCode?: number;
  errorName?: string;
  authErrorCode?: string;
}

export interface SafePkceExchangeDiagnostics {
  event: "auth.pkce.exchange_failed";
  statusCode?: number;
  errorName?: string;
  authErrorCode?: string;
  hadVerifierCookie: boolean;
  runtime?: string;
}

const RATE_LIMIT_CODES = new Set(["over_email_send_rate_limit", "over_request_rate_limit", "over_sms_send_rate_limit"]);
const EXPIRED_CODES = new Set(["flow_state_not_found", "flow_state_expired", "bad_code_verifier"]);

export function isAuthCallbackPath(pathname: string) {
  return pathname === "/auth/callback" || pathname.startsWith("/auth/callback/");
}

export function isPkceVerifierCookieName(name: string) {
  return name.includes("code-verifier");
}

export function isSupabaseSessionCookieName(name: string) {
  return name.includes("-auth-token") && !name.includes("code-verifier");
}

export function parseAuthError(error: unknown): ParsedAuthError {
  if (!error || typeof error !== "object") return {};
  const record = error as { status?: unknown; code?: unknown; name?: unknown };
  const parsed: ParsedAuthError = {};
  if (typeof record.status === "number") parsed.statusCode = record.status;
  if (typeof record.name === "string" && record.name) parsed.errorName = record.name.slice(0, 80);
  if (typeof record.code === "string" && record.code) parsed.authErrorCode = record.code.slice(0, 80);
  return parsed;
}

export function classifySupabaseAuthError(error: unknown): PkceUserErrorKind | "failed" {
  const parsed = parseAuthError(error);
  if (parsed.statusCode === 429 || (parsed.authErrorCode && RATE_LIMIT_CODES.has(parsed.authErrorCode))) {
    return "rate_limited";
  }
  if (
    parsed.statusCode === 422 ||
    (parsed.authErrorCode && EXPIRED_CODES.has(parsed.authErrorCode))
  ) {
    return "expired";
  }
  if (
    parsed.authErrorCode === "pkce_code_verifier_not_found" ||
    parsed.errorName === "AuthPKCECodeVerifierMissingError"
  ) {
    return "exchange";
  }
  return "failed";
}

export function classifyPkceExchangeError(error: unknown): Exclude<PkceUserErrorKind, "missing_code" | "rate_limited"> {
  const classified = classifySupabaseAuthError(error);
  if (classified === "expired") return "expired";
  return "exchange";
}

export function signupAuthErrorMessage(error: unknown): string {
  if (classifySupabaseAuthError(error) === "rate_limited") {
    return "Too many emails sent. Wait a few minutes and try again.";
  }
  return "We couldn't create the account. Try again.";
}

export function resendAuthErrorMessage(error: unknown): string {
  if (classifySupabaseAuthError(error) === "rate_limited") {
    return "Too many emails sent. Wait a few minutes and try again.";
  }
  return "We couldn't send another verification email. Try again shortly.";
}

export function verifyEmailErrorMessage(kind: string | null | undefined): string | null {
  switch (kind) {
    case "expired":
      return "That verification link has expired or already been used. Request a new one.";
    case "exchange":
      return "We couldn't complete verification. Open the link on the same device where you signed up, or request a new email.";
    case "missing_code":
      return "That verification link is incomplete. Request a new email.";
    case "rate_limited":
      return "Too many emails sent. Wait a few minutes and try again.";
    default:
      return null;
  }
}

export function safePkceExchangeDiagnostics(input: {
  error: unknown;
  hadVerifierCookie: boolean;
  runtime?: string;
}): SafePkceExchangeDiagnostics {
  const parsed = parseAuthError(input.error);
  const diagnostics: SafePkceExchangeDiagnostics = {
    event: "auth.pkce.exchange_failed",
    hadVerifierCookie: input.hadVerifierCookie,
  };
  if (parsed.statusCode !== undefined) diagnostics.statusCode = parsed.statusCode;
  if (parsed.errorName) diagnostics.errorName = parsed.errorName;
  if (parsed.authErrorCode) diagnostics.authErrorCode = parsed.authErrorCode;
  if (input.runtime) diagnostics.runtime = input.runtime;
  return diagnostics;
}

export function logPkceExchangeFailure(diagnostics: SafePkceExchangeDiagnostics): void {
  const payload: Record<string, string | number | boolean> = { event: diagnostics.event };
  if (diagnostics.statusCode !== undefined) payload.statusCode = diagnostics.statusCode;
  if (diagnostics.errorName) payload.errorName = diagnostics.errorName;
  if (diagnostics.authErrorCode) payload.authErrorCode = diagnostics.authErrorCode;
  payload.hadVerifierCookie = diagnostics.hadVerifierCookie;
  if (diagnostics.runtime) payload.runtime = diagnostics.runtime;
  payload.ts = new Date().toISOString();
  console.error(JSON.stringify(payload));
}
