import type { StripeSubscriptionSnapshot } from "./port";

function asId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && "id" in value && typeof (value as { id: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return undefined;
}

function unixToIso(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return new Date(value * 1000).toISOString();
}

export function snapshotStripeSubscription(object: Record<string, unknown>): StripeSubscriptionSnapshot | undefined {
  const id = asId(object.id);
  const customerId = asId(object.customer);
  if (!id || !customerId) return undefined;
  const items = object.items as { data?: Record<string, unknown>[] } | undefined;
  const first = items?.data?.[0];
  const priceId = asId(first?.price);
  const periodEnd = unixToIso(first?.current_period_end) ?? unixToIso(object.current_period_end);
  return {
    id,
    customerId,
    status: typeof object.status === "string" ? object.status : "incomplete",
    priceId,
    currentPeriodEnd: periodEnd,
  };
}

export function stripeMetadataValue(object: Record<string, unknown>, key: string): string | undefined {
  const metadata = object.metadata;
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
