import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailProviderError } from "@/infrastructure/email/port";

const API_KEY = "re_live_notARealSecretKeyValue";
const CRON = "preview-cron-secret-value";
const WEBHOOK = "whsec_dGVzdHNlY3JldA==";
const BYPASS = "vercel-bypass-secret-value";
const RECIPIENT = "niel@example.com";
const FROM = "SOURCE <requests@mail.source.test>";
const PORTAL = "https://preview.example/s/secret-grant-token";

const getSourceEnvironment = vi.fn();
const getRuntimeEmailProvider = vi.fn();
const getPersistence = vi.fn();
const requireCronSecret = vi.fn();

vi.mock("@/infrastructure/runtime", () => ({
  getSourceEnvironment: (...args: unknown[]) => getSourceEnvironment(...args),
  getRuntimeEmailProvider: (...args: unknown[]) => getRuntimeEmailProvider(...args),
  getPersistence: (...args: unknown[]) => getPersistence(...args),
}));

vi.mock("@/server/source/cron-auth", () => ({
  requireCronSecret: (...args: unknown[]) => requireCronSecret(...args),
}));

import { POST } from "@/app/api/internal/email/test/route";

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
}

describe("POST /api/internal/email/test", () => {
  beforeEach(() => {
    getSourceEnvironment.mockReset();
    getRuntimeEmailProvider.mockReset();
    getPersistence.mockReset();
    requireCronSecret.mockReset();
    delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  });

  it("returns generic 500 JSON and logs exactly one email.test.failed event", async () => {
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = BYPASS;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getSourceEnvironment.mockReturnValue({
      runtime: "preview",
      emailMode: "live",
      emailProvider: "resend",
      emailFrom: FROM,
      emailAllowedRecipients: [RECIPIENT],
      resendApiKey: API_KEY,
      resendWebhookSecret: WEBHOOK,
      cronSecret: CRON,
      appPublicUrl: "https://preview.example",
    });
    getRuntimeEmailProvider.mockReturnValue({
      send: async () => {
        throw new EmailProviderError(
          `invalid_api_key ${API_KEY} sending to ${RECIPIENT} from ${FROM} ${PORTAL} bypass=${BYPASS}`,
          { retryable: false, permanent: true, statusCode: 401, providerErrorName: "invalid_api_key" }
        );
      },
    });

    const response = await POST(
      new Request("http://localhost/api/internal/email/test", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${CRON}` },
        body: JSON.stringify({ to: RECIPIENT, html: "<secret>" }),
      })
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "ERROR", message: "Request failed." });
    expectNoSecrets(JSON.stringify(body));

    const emailLogs = errorSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.includes('"event":"email.test.failed"'));
    expect(emailLogs).toHaveLength(1);
    const payload = JSON.parse(emailLogs[0] as string) as Record<string, unknown>;
    expect(payload.event).toBe("email.test.failed");
    expect(payload.provider).toBe("RESEND");
    expect(payload.errorType).toBe("EmailProviderError");
    expect(payload.statusCode).toBe(401);
    expect(payload.providerErrorName).toBe("invalid_api_key");
    expect(payload.fromDomain).toBe("mail.source.test");
    expect(payload.sourceEnv).toBe("preview");
    expect(payload.emailMode).toBe("live");
    expect(payload.emailProvider).toBe("resend");
    expectNoSecrets(emailLogs[0] as string);
    expect(emailLogs[0]).not.toContain("<secret>");
    errorSpy.mockRestore();
  });

  it("does not log email.test.failed in production and stays unavailable", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getSourceEnvironment.mockReturnValue({
      runtime: "production",
      emailMode: "live",
      emailProvider: "resend",
      emailFrom: FROM,
      resendApiKey: API_KEY,
      cronSecret: CRON,
    });

    const response = await POST(
      new Request("http://localhost/api/internal/email/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: RECIPIENT }),
      })
    );
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("FORBIDDEN");
    expect(getRuntimeEmailProvider).not.toHaveBeenCalled();
    const emailLogs = errorSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.includes("email.test.failed"));
    expect(emailLogs).toHaveLength(0);
    expectNoSecrets(JSON.stringify(body));
    errorSpy.mockRestore();
  });
});
