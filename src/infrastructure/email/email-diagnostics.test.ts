import { describe, expect, it } from "vitest";
import { EmailProviderError } from "@/infrastructure/email/port";
import {
  emailFromDomain,
  emailRuntimeClassification,
  safeEmailTestFailureDiagnostics,
  sanitizeEmailDiagnosticMessage,
} from "@/infrastructure/email/email-diagnostics";
import { classifyResendError } from "@/infrastructure/email/resend";

const API_KEY = "re_live_notARealSecretKeyValue";
const CRON = "preview-cron-secret-value";
const WEBHOOK = "whsec_dGVzdHNlY3JldA==";
const BYPASS = "vercel-bypass-secret-value";
const RECIPIENT = "niel@example.com";
const FROM = "SOURCE <requests@mail.source.test>";
const PORTAL = "https://preview.example/s/secret-grant-token";

function expectNoSecrets(blob: string) {
  expect(blob).not.toContain(API_KEY);
  expect(blob).not.toContain(CRON);
  expect(blob).not.toContain(WEBHOOK);
  expect(blob).not.toContain(BYPASS);
  expect(blob).not.toContain(RECIPIENT);
  expect(blob).not.toContain("niel@");
  expect(blob).not.toContain(FROM);
  expect(blob).not.toContain("requests@mail.source.test");
  expect(blob).not.toContain(PORTAL);
  expect(blob).not.toContain("secret-grant-token");
  expect(blob).not.toMatch(/https?:\/\/preview\.example/i);
}

describe("email test diagnostics", () => {
  it("extracts fromDomain only from a From address", () => {
    expect(emailFromDomain(FROM)).toBe("mail.source.test");
    expect(emailFromDomain("requests@mail.source.test")).toBe("mail.source.test");
    expect(JSON.stringify(emailFromDomain(FROM))).not.toContain("requests@");
  });

  it("classifies runtime email config without exposing secrets", () => {
    const classification = emailRuntimeClassification({
      emailMode: "live",
      emailProvider: "resend",
      emailAllowedRecipients: [RECIPIENT],
      emailFrom: FROM,
      resendApiKey: API_KEY,
    });
    expect(classification).toEqual({
      emailMode: "live",
      provider: "resend",
      allowListConfigured: true,
      fromDomain: "mail.source.test",
      resendApiKeyConfigured: true,
    });
    expectNoSecrets(JSON.stringify(classification));
  });

  it("redacts keys, recipients, From addresses, portal URLs, and secrets from messages", () => {
    const message = [
      `Resend invalid_api_key ${API_KEY} for ${RECIPIENT}`,
      `from ${FROM}`,
      `portal ${PORTAL}`,
      `Authorization: Bearer ${CRON}`,
      WEBHOOK,
      BYPASS,
    ].join(" ");
    const sanitized = sanitizeEmailDiagnosticMessage(message, [API_KEY, CRON, WEBHOOK, BYPASS]);
    expectNoSecrets(sanitized);
    expect(sanitized).toMatch(/invalid_api_key|Resend/i);
  });

  it("emits allow-listed email.test.failed fields without secrets", () => {
    const diagnostics = safeEmailTestFailureDiagnostics({
      error: new EmailProviderError(
        `API key ${API_KEY} rejected for ${RECIPIENT} from ${FROM} ${PORTAL}`,
        { retryable: false, permanent: true, statusCode: 401, providerErrorName: "invalid_api_key" }
      ),
      env: {
        runtime: "preview",
        emailMode: "live",
        emailProvider: "resend",
        emailFrom: FROM,
        emailAllowedRecipients: [RECIPIENT],
        resendApiKey: API_KEY,
        resendWebhookSecret: WEBHOOK,
        cronSecret: CRON,
      },
    });
    expect(diagnostics).toMatchObject({
      event: "email.test.failed",
      provider: "RESEND",
      errorType: "EmailProviderError",
      retryable: false,
      permanent: true,
      sourceEnv: "preview",
      emailMode: "live",
      emailProvider: "resend",
      fromDomain: "mail.source.test",
      statusCode: 401,
      providerErrorName: "invalid_api_key",
    });
    expect(diagnostics.message).not.toContain(RECIPIENT);
    expectNoSecrets(JSON.stringify(diagnostics));
  });
});

describe("Resend error classification (unchanged retry semantics)", () => {
  it("keeps 422 permanent and attaches safe status/name only", () => {
    const error = classifyResendError({
      message: `The '${RECIPIENT}' email address is not valid`,
      statusCode: 422,
      name: "validation_error",
    });
    expect(error).toBeInstanceOf(EmailProviderError);
    expect(error.retryable).toBe(false);
    expect(error.permanent).toBe(true);
    expect(error.statusCode).toBe(422);
    expect(error.providerErrorName).toBe("validation_error");
  });

  it("keeps 429 retryable", () => {
    const error = classifyResendError({
      message: "Too many requests",
      statusCode: 429,
      name: "rate_limit_exceeded",
    });
    expect(error.retryable).toBe(true);
    expect(error.permanent).toBe(false);
    expect(error.statusCode).toBe(429);
    expect(error.providerErrorName).toBe("rate_limit_exceeded");
  });
});
