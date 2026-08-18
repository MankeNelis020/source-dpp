import type { SourceEnvironment } from "@/infrastructure/environment/source-environment";
import { SourceEnvironmentError } from "@/infrastructure/environment/source-environment";
import type { EmailProvider } from "./port";
import { ResendEmailAdapter } from "./resend";
import { getSharedTestEmailProvider } from "./test-provider";

/**
 * Authoritative email factory. Routes must not construct Resend clients.
 */
export function createRuntimeEmailProvider(env: SourceEnvironment): EmailProvider {
  if (env.emailProvider === "test") {
    if (env.runtime === "production") {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: production cannot use the test email provider."
      );
    }
    return getSharedTestEmailProvider();
  }

  if (!env.resendApiKey || !env.emailFrom) {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: RESEND_API_KEY and SOURCE_EMAIL_FROM are required for Resend."
    );
  }

  if (env.runtime === "preview" && env.emailMode === "live" && !(env.emailAllowedRecipients ?? []).length) {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: preview live email requires SOURCE_EMAIL_ALLOWED_RECIPIENTS."
    );
  }

  return new ResendEmailAdapter({
    apiKey: env.resendApiKey,
    allowedRecipients: env.emailAllowedRecipients ?? [],
    enforceAllowList: env.runtime !== "production" && env.emailMode === "live",
  });
}

export function emailConfigurationStatus(env: SourceEnvironment): "configured" | "unconfigured" | "test" {
  if (env.emailProvider === "test") return "test";
  if (env.resendApiKey && env.emailFrom && env.resendWebhookSecret) return "configured";
  return "unconfigured";
}

export { emailRuntimeClassification } from "./email-diagnostics";
