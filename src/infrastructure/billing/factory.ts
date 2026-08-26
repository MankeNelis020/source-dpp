import type { SourceEnvironment } from "@/infrastructure/environment/source-environment";
import type { StripeBillingPort } from "./port";
import { LiveStripeBillingAdapter } from "./live";

export function createRuntimeStripeBilling(env: SourceEnvironment): StripeBillingPort | undefined {
  if (!env.stripeSecretKey) return undefined;
  return new LiveStripeBillingAdapter(env.stripeSecretKey);
}

export function stripeBillingConfigured(env: SourceEnvironment): boolean {
  return Boolean(env.stripeSecretKey);
}
