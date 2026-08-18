import type { IdentityProvider } from "./identity";
import { TestIdentityProvider } from "./test-identity";
import { SupabaseIdentityProvider } from "./supabase/provider";
import {
  loadSourceEnvironment,
  SourceEnvironmentError,
  type SourceEnvironment,
} from "@/infrastructure/environment/source-environment";

let override: IdentityProvider | undefined;

export function setIdentityProviderForTests(provider: IdentityProvider | undefined) {
  override = provider;
}

export function createIdentityProvider(env: SourceEnvironment = loadSourceEnvironment()): IdentityProvider {
  if (env.runtime === "preview" || env.runtime === "production") {
    if (env.identityProvider !== "supabase") {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: preview and production cannot use the test identity provider."
      );
    }
    return new SupabaseIdentityProvider();
  }
  if (env.identityProvider === "supabase") return new SupabaseIdentityProvider();
  return new TestIdentityProvider();
}

export function getIdentityProvider(): IdentityProvider {
  if (override) return override;
  return createIdentityProvider();
}
