import type { SourceEnvironment } from "@/infrastructure/environment/source-environment";
import { SourceEnvironmentError } from "@/infrastructure/environment/source-environment";
import type { ObjectStorage } from "./port";
import { getMemoryObjectStorage } from "./memory";
import { SupabaseObjectStorage } from "./supabase";

/**
 * Authoritative object-storage factory. Routes must not construct storage clients.
 */
export function createRuntimeObjectStorage(env: SourceEnvironment): ObjectStorage {
  if (env.objectStorage === "memory") {
    if (env.runtime === "preview" || env.runtime === "production") {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: memory object storage is not allowed in preview or production."
      );
    }
    return getMemoryObjectStorage();
  }

  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: SUPABASE_SERVICE_ROLE_KEY is required for object storage."
    );
  }

  return new SupabaseObjectStorage({
    supabaseUrl: env.supabaseUrl,
    serviceRoleKey: env.supabaseServiceRoleKey,
  });
}
