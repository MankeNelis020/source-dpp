export type TransportStatus =
  | "QUEUED"
  | "SUBMITTING"
  | "PROVIDER_ACCEPTED"
  | "DELIVERED"
  | "BOUNCED"
  | "COMPLAINED"
  | "FAILED";

export type EmailTemplateId = "SUPPLIER_REQUEST" | "REMINDER" | "AUTHORIZATION" | "UPSTREAM";

export interface OutboundMessageRecord {
  id: string;
  organisationId: string;
  caseId?: string;
  requestId?: string;
  supplierActorId?: string;
  portalGrantId?: string;
  outboxEventId: string;
  semanticKey: string;
  recipient: string;
  fromAddress: string;
  templateId: EmailTemplateId;
  templateVersion: string;
  category: string;
  provider: "RESEND" | "TEST";
  providerMessageId?: string;
  transportStatus: TransportStatus;
  tokenFingerprint?: string;
  createdAt: string;
  providerAcceptedAt?: string;
  deliveredAt?: string;
  bouncedAt?: string;
  complainedAt?: string;
  lastProviderEventAt?: string;
  lastError?: string;
}

export interface EmailProviderEventRecord {
  id: string;
  organisationId?: string;
  outboundMessageId?: string;
  provider: "RESEND" | "TEST";
  providerEventId: string;
  providerMessageId?: string;
  eventType: string;
  occurredAt: string;
  processedAt: string;
}

const RANK: Record<TransportStatus, number> = {
  QUEUED: 0,
  SUBMITTING: 1,
  FAILED: 2,
  PROVIDER_ACCEPTED: 3,
  DELIVERED: 4,
  BOUNCED: 5,
  COMPLAINED: 5,
};

export function transportStatusForProviderEvent(eventType: string): TransportStatus | undefined {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("complain")) return "COMPLAINED";
  if (normalized.includes("bounce")) return "BOUNCED";
  if (normalized.includes("deliver")) return "DELIVERED";
  if (normalized.includes("sent") || normalized.includes("accept")) return "PROVIDER_ACCEPTED";
  return undefined;
}

export function canAdvanceTransport(current: TransportStatus, next: TransportStatus): boolean {
  if (current === next) return false;
  if (RANK[next] > RANK[current]) return true;
  if (RANK[next] === RANK[current] && next !== current) return true;
  return false;
}

export function humanTransportLabel(status: TransportStatus): string {
  switch (status) {
    case "QUEUED":
      return "Request queued";
    case "SUBMITTING":
      return "Sending";
    case "PROVIDER_ACCEPTED":
      return "Email sent";
    case "DELIVERED":
      return "Email delivered";
    case "BOUNCED":
      return "Email could not be delivered";
    case "COMPLAINED":
      return "Recipient asked us to stop";
    case "FAILED":
      return "Delivery delayed";
  }
}
