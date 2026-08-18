/**
 * Infrastructure-neutral outbound email port.
 * Domain and React must never import the Resend SDK.
 */

export type EmailProviderName = "RESEND" | "TEST";

export type EmailCategory =
  | "AUTH_ACCOUNT"
  | "TEAM_INVITATION"
  | "SUPPLIER_REQUEST"
  | "SUPPLIER_REMINDER"
  | "SUPPLIER_AUTHORIZATION"
  | "SUPPLIER_UPSTREAM"
  | "SYSTEM_OPERATIONAL";

export interface OutboundEmail {
  semanticKey: string;
  to: string[];
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  tags?: Record<string, string>;
  category: EmailCategory;
}

export interface EmailSendResult {
  provider: EmailProviderName;
  providerMessageId: string;
  acceptedAt: string;
  duplicate?: boolean;
}

export interface EmailProvider {
  send(message: OutboundEmail): Promise<EmailSendResult>;
}

export class EmailProviderError extends Error {
  readonly retryable: boolean;
  readonly permanent: boolean;
  readonly statusCode?: number;
  readonly providerErrorName?: string;

  constructor(
    message: string,
    options: { retryable?: boolean; permanent?: boolean; statusCode?: number; providerErrorName?: string } = {}
  ) {
    super(message);
    this.name = "EmailProviderError";
    this.retryable = options.retryable ?? true;
    this.permanent = options.permanent ?? false;
    this.statusCode = options.statusCode;
    this.providerErrorName = options.providerErrorName;
  }
}

export function isEmailSendResult(value: unknown): value is EmailSendResult {
  return Boolean(value && typeof value === "object" && "providerMessageId" in value && "provider" in value);
}
