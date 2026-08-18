import { EmailProviderError, type EmailProvider, type EmailSendResult, type OutboundEmail } from "./port";
import { recipientAllowed } from "./validate";

/**
 * Server-only Resend adapter. Never import from Client Components.
 * The API key must come from process environment, never from the browser.
 */
export class ResendEmailAdapter implements EmailProvider {
  constructor(
    private readonly config: {
      apiKey: string;
      allowedRecipients?: string[];
      enforceAllowList: boolean;
    }
  ) {}

  async send(message: OutboundEmail): Promise<EmailSendResult> {
    if (this.config.enforceAllowList) {
      const allow = this.config.allowedRecipients ?? [];
      for (const to of message.to) {
        if (!recipientAllowed(to, allow)) {
          throw new EmailProviderError("recipient not allow-listed for live preview send", {
            retryable: false,
            permanent: true,
          });
        }
      }
    }

    const { Resend } = await import("resend");
    const resend = new Resend(this.config.apiKey);
    try {
      const result = await resend.emails.send(
        {
          from: message.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          replyTo: message.replyTo,
          tags: Object.entries(message.tags ?? {})
            .filter(([, value]) => value && !/token|url|email|recipient/i.test(value))
            .slice(0, 8)
            .map(([name, value]) => ({ name: name.slice(0, 256), value: value.slice(0, 256) })),
        },
        { idempotencyKey: message.semanticKey.slice(0, 256) }
      );
      if (result.error) {
        throw classifyResendError(result.error);
      }
      const id = result.data?.id;
      if (!id) {
        throw new EmailProviderError("provider did not return a message id", { retryable: true });
      }
      return {
        provider: "RESEND",
        providerMessageId: id,
        acceptedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof EmailProviderError) throw error;
      throw classifyResendError(error);
    }
  }
}

function classifyResendError(error: unknown): EmailProviderError {
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error
    ? String((error as { message: unknown }).message)
    : String(error);
  const status =
    typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode: unknown }).statusCode) : undefined;
  if (/invalid recipient|not a valid email|validation|forbidden|unauthorized|401|403|422/i.test(message) || status === 422 || status === 400) {
    return new EmailProviderError(message, { retryable: false, permanent: true });
  }
  if (status === 429 || (status !== undefined && status >= 500) || /timeout|ETIMEDOUT|ECONNRESET|429|5\d\d|temporar|unavailable/i.test(message)) {
    return new EmailProviderError(message, { retryable: true });
  }
  return new EmailProviderError(message, { retryable: true });
}
