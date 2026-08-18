import type { EmailMode, EmailProviderKind, RuntimeEnvironment, SourceEnvironment } from "@/infrastructure/environment/source-environment";
import type { EmailProviderName } from "@/infrastructure/email/port";
import { EmailProviderError } from "@/infrastructure/email/port";

/**
 * Operational diagnostics for POST /api/internal/email/test.
 * Safe to retain: allow-listed fields only. Never log keys, recipients, From addresses, bodies, or tokens.
 */

export interface SafeEmailTestFailureDiagnostics {
  event: "email.test.failed";
  provider: EmailProviderName;
  errorType: string;
  message: string;
  retryable: boolean;
  permanent: boolean;
  sourceEnv?: RuntimeEnvironment | string;
  emailMode?: EmailMode | string;
  emailProvider?: EmailProviderKind | string;
  fromDomain?: string;
  statusCode?: number;
  providerErrorName?: string;
}

const EMAIL_RE = /[^\s<>"',;()]+@[^\s<>"',;()]+/g;
const URL_RE = /https?:\/\/[^\s"'<>]+/gi;
const PORTAL_RE = /\/s\/[A-Za-z0-9._~-]+/g;
const RESEND_KEY_RE = /\bre_[A-Za-z0-9]{8,}\b/g;
const WHSEC_RE = /\bwhsec_[A-Za-z0-9+/=_-]+\b/g;
const BEARER_RE = /\bBearer\s+\S+/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

export function emailFromDomain(from: string | undefined): string | undefined {
  if (!from) return undefined;
  const angled = from.match(/<([^>]+)>/);
  const address = (angled?.[1] ?? from).trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return undefined;
  const domain = address.slice(at + 1).replace(/[>\s]+$/g, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return undefined;
  return domain;
}

export function emailRuntimeClassification(env: Pick<
  SourceEnvironment,
  "emailMode" | "emailProvider" | "emailAllowedRecipients" | "emailFrom" | "resendApiKey"
>) {
  return {
    emailMode: env.emailMode === "live" ? "live" : "test",
    provider: env.emailProvider === "resend" ? "resend" : "test",
    allowListConfigured: (env.emailAllowedRecipients ?? []).length > 0,
    fromDomain: emailFromDomain(env.emailFrom),
    resendApiKeyConfigured: Boolean(env.resendApiKey),
  } as const;
}

export function secretsFromEmailEnv(env?: Pick<SourceEnvironment, "resendApiKey" | "resendWebhookSecret" | "cronSecret">): string[] {
  const secrets = new Set<string>();
  for (const value of [env?.resendApiKey, env?.resendWebhookSecret, env?.cronSecret, process.env.VERCEL_AUTOMATION_BYPASS_SECRET]) {
    if (value && value.length >= 8) secrets.add(value);
  }
  return [...secrets];
}

export function sanitizeEmailDiagnosticMessage(message: string, extraSecrets: string[] = []): string {
  EMAIL_RE.lastIndex = 0;
  URL_RE.lastIndex = 0;
  PORTAL_RE.lastIndex = 0;
  RESEND_KEY_RE.lastIndex = 0;
  WHSEC_RE.lastIndex = 0;
  BEARER_RE.lastIndex = 0;
  JWT_RE.lastIndex = 0;
  let next = message;
  next = next.replace(RESEND_KEY_RE, "[redacted-key]");
  next = next.replace(WHSEC_RE, "[redacted-secret]");
  next = next.replace(BEARER_RE, "Bearer [redacted]");
  next = next.replace(JWT_RE, "[redacted-key]");
  next = next.replace(URL_RE, "[redacted-url]");
  next = next.replace(PORTAL_RE, "/s/[redacted]");
  next = next.replace(EMAIL_RE, "[redacted-email]");
  for (const secret of extraSecrets) {
    if (!secret || secret.length < 8) continue;
    next = next.split(secret).join("[redacted]");
  }
  return next.replace(/\s+/g, " ").trim().slice(0, 300);
}

export function safeEmailTestFailureDiagnostics(input: {
  error: EmailProviderError;
  env?: Pick<
    SourceEnvironment,
    | "runtime"
    | "emailMode"
    | "emailProvider"
    | "emailFrom"
    | "emailAllowedRecipients"
    | "resendApiKey"
    | "resendWebhookSecret"
    | "cronSecret"
  >;
}): SafeEmailTestFailureDiagnostics {
  const extraSecrets = secretsFromEmailEnv(input.env);
  const classification = input.env ? emailRuntimeClassification(input.env) : undefined;
  const diagnostics: SafeEmailTestFailureDiagnostics = {
    event: "email.test.failed",
    provider: classification?.provider === "resend" || input.env?.emailProvider === "resend" ? "RESEND" : "TEST",
    errorType: "EmailProviderError",
    message: sanitizeEmailDiagnosticMessage(input.error.message, extraSecrets),
    retryable: input.error.retryable,
    permanent: input.error.permanent,
    sourceEnv: input.env?.runtime,
    emailMode: classification?.emailMode ?? input.env?.emailMode,
    emailProvider: classification?.provider ?? input.env?.emailProvider,
    fromDomain: classification?.fromDomain,
  };
  if (input.error.statusCode !== undefined) diagnostics.statusCode = input.error.statusCode;
  if (input.error.providerErrorName) diagnostics.providerErrorName = input.error.providerErrorName;
  return redactRemainingEmailSecrets(diagnostics, extraSecrets);
}

export function logEmailTestFailure(diagnostics: SafeEmailTestFailureDiagnostics): void {
  const payload: Record<string, string | number | boolean> = { event: diagnostics.event };
  const fields: Array<keyof SafeEmailTestFailureDiagnostics> = [
    "provider",
    "errorType",
    "message",
    "retryable",
    "permanent",
    "sourceEnv",
    "emailMode",
    "emailProvider",
    "fromDomain",
    "statusCode",
    "providerErrorName",
  ];
  for (const key of fields) {
    const value = diagnostics[key];
    if (value === undefined) continue;
    payload[key] = value;
  }
  payload.ts = new Date().toISOString();
  console.error(JSON.stringify(payload));
}

function redactRemainingEmailSecrets(
  diagnostics: SafeEmailTestFailureDiagnostics,
  extraSecrets: string[]
): SafeEmailTestFailureDiagnostics {
  EMAIL_RE.lastIndex = 0;
  URL_RE.lastIndex = 0;
  PORTAL_RE.lastIndex = 0;
  RESEND_KEY_RE.lastIndex = 0;
  WHSEC_RE.lastIndex = 0;
  BEARER_RE.lastIndex = 0;
  JWT_RE.lastIndex = 0;
  let blob = JSON.stringify(diagnostics);
  blob = blob.replace(RESEND_KEY_RE, "[redacted-key]");
  blob = blob.replace(WHSEC_RE, "[redacted-secret]");
  blob = blob.replace(BEARER_RE, "Bearer [redacted]");
  blob = blob.replace(JWT_RE, "[redacted-key]");
  blob = blob.replace(URL_RE, "[redacted-url]");
  blob = blob.replace(PORTAL_RE, "/s/[redacted]");
  blob = blob.replace(EMAIL_RE, "[redacted-email]");
  for (const secret of extraSecrets) {
    if (!secret || secret.length < 8) continue;
    blob = blob.split(secret).join("[redacted]");
  }
  return JSON.parse(blob) as SafeEmailTestFailureDiagnostics;
}
