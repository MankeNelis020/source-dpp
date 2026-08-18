import type { EmailProvider, EmailSendResult, OutboundEmail } from "./port";
import { EmailProviderError } from "./port";

export class TestEmailProvider implements EmailProvider {
  sent: OutboundEmail[] = [];
  failWith?: Error;
  failTimes = 0;
  private failures = 0;

  async send(message: OutboundEmail): Promise<EmailSendResult> {
    if (this.failWith && this.failures < (this.failTimes || Number.POSITIVE_INFINITY)) {
      this.failures += 1;
      throw this.failWith;
    }
    const existing = this.sent.find((row) => row.semanticKey === message.semanticKey);
    if (existing) {
      return {
        provider: "TEST",
        providerMessageId: `test:${message.semanticKey}`,
        acceptedAt: new Date().toISOString(),
        duplicate: true,
      };
    }
    if (!message.to.length) {
      throw new EmailProviderError("invalid recipient", { retryable: false, permanent: true });
    }
    this.sent.push({ ...message, to: [...message.to] });
    return {
      provider: "TEST",
      providerMessageId: `test:${message.semanticKey}`,
      acceptedAt: new Date().toISOString(),
    };
  }
}

let shared: TestEmailProvider | undefined;

export function getSharedTestEmailProvider() {
  shared ??= new TestEmailProvider();
  return shared;
}

export function resetSharedTestEmailProvider() {
  shared = new TestEmailProvider();
  return shared;
}
