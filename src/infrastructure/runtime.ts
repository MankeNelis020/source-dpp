import { getMemoryPersistence } from "@/infrastructure/database/memory";
import { checkPostgresHealth, memoryHealth, type PersistenceHealth } from "@/infrastructure/database/health";
import { createRuntimePersistence, type RuntimePersistence } from "@/infrastructure/database/runtime-persistence";
import type { PersistencePort } from "@/infrastructure/database/ports";
import { getMemoryRateLimiter } from "@/infrastructure/rate-limit/memory";
import type { RateLimiter } from "@/infrastructure/rate-limit/port";
import { getMemoryEvidenceStorage, type EvidenceStorage } from "@/infrastructure/storage/evidence";
import { createRuntimeObjectStorage } from "@/infrastructure/storage/factory";
import { getMemoryObjectStorage, resetMemoryObjectStorage } from "@/infrastructure/storage/memory";
import type { ObjectStorage } from "@/infrastructure/storage/port";
import { createRuntimeEmailProvider } from "@/infrastructure/email/factory";
import type { EmailProvider } from "@/infrastructure/email/port";
import { getSharedTestEmailProvider, resetSharedTestEmailProvider } from "@/infrastructure/email/test-provider";
import {
  isNextBuildPhase,
  loadSourceEnvironment,
  SourceEnvironmentError,
  type SourceEnvironment,
} from "@/infrastructure/environment/source-environment";

let runtime: RuntimePersistence | undefined;
let lastHealth: PersistenceHealth | undefined;
let bootError: Error | undefined;
let objectStorage: ObjectStorage | undefined;
let objectStorageOverride: ObjectStorage | undefined;
let emailProvider: EmailProvider | undefined;
let emailProviderOverride: EmailProvider | undefined;

export function isPostgresConfigured(): boolean {
  if (isNextBuildPhase()) return false;
  try {
    return loadSourceEnvironment().persistence === "postgres";
  } catch {
    return false;
  }
}

export function getSourceEnvironment(): SourceEnvironment {
  return loadSourceEnvironment();
}

export function getPersistence(): PersistencePort {
  if (bootError) throw bootError;
  return getRuntime().store;
}

export function setPersistenceForRuntime(store: PersistencePort) {
  runtime = { store, kind: "postgres" };
  bootError = undefined;
}

export function getRuntimeRateLimiter(): RateLimiter {
  return getRuntime().rateLimiter ?? getMemoryRateLimiter();
}

export function setRuntimeRateLimiter(limiter: RateLimiter) {
  const current = getRuntime();
  runtime = { ...current, rateLimiter: limiter };
}

export function getRuntimeObjectStorage(): ObjectStorage {
  if (objectStorageOverride) return objectStorageOverride;
  if (objectStorage) return objectStorage;
  if (isNextBuildPhase()) {
    objectStorage = getMemoryObjectStorage();
    return objectStorage;
  }
  try {
    objectStorage = createRuntimeObjectStorage(loadSourceEnvironment());
    return objectStorage;
  } catch (error) {
    bootError = error instanceof Error ? error : new SourceEnvironmentError("SOURCE runtime failed to start.");
    throw bootError;
  }
}

export function setRuntimeObjectStorage(storage: ObjectStorage | undefined) {
  objectStorageOverride = storage;
}

export function getRuntimeEmailProvider(): EmailProvider {
  if (emailProviderOverride) return emailProviderOverride;
  if (emailProvider) return emailProvider;
  if (isNextBuildPhase()) {
    emailProvider = getSharedTestEmailProvider();
    return emailProvider;
  }
  try {
    emailProvider = createRuntimeEmailProvider(loadSourceEnvironment());
    return emailProvider;
  } catch (error) {
    bootError = error instanceof Error ? error : new SourceEnvironmentError("SOURCE runtime failed to start.");
    throw bootError;
  }
}

export function setRuntimeEmailProvider(provider: EmailProvider | undefined) {
  emailProviderOverride = provider;
}

export function getRuntimeEvidenceStorage(): EvidenceStorage {
  return getMemoryEvidenceStorage();
}

export function getPersistenceHealth(): PersistenceHealth {
  if (lastHealth) return lastHealth;
  return getRuntime().kind === "postgres"
    ? { database: "error", persistence: "postgres", storage: "error" }
    : memoryHealth();
}

export function resetRuntimeForTests() {
  runtime = undefined;
  lastHealth = undefined;
  bootError = undefined;
  objectStorage = undefined;
  objectStorageOverride = undefined;
  emailProvider = undefined;
  emailProviderOverride = undefined;
  resetMemoryObjectStorage();
  resetSharedTestEmailProvider();
}

/**
 * HMAC demo login is retired. Preview/production never allow it.
 * Classification: REMOVE. Local/CI use TestIdentityProvider, not this flag.
 */
export function demoAuthEnabled(): boolean {
  try {
    const env = loadSourceEnvironment();
    if (env.runtime === "preview" || env.runtime === "production") return false;
  } catch {
    return false;
  }
  return false;
}

export function durableEvidenceRequired(env: SourceEnvironment = loadSourceEnvironment()): boolean {
  return env.objectStorage === "supabase";
}

/**
 * Resolve environment → validate project URL → validate secrets → create persistence → health-check.
 * Preview/production never fall back to memory.
 */
export async function bootSourceRuntime(): Promise<RuntimePersistence> {
  if (isNextBuildPhase()) {
    return { store: getMemoryPersistence(), kind: "memory" };
  }
  if (bootError) throw bootError;
  if (!runtime) {
    try {
      const env = loadSourceEnvironment();
      runtime = createRuntimePersistence(env);
      objectStorage = createRuntimeObjectStorage(env);
      emailProvider = createRuntimeEmailProvider(env);
    } catch (error) {
      bootError =
        error instanceof Error ? error : new SourceEnvironmentError("SOURCE runtime failed to start.");
      throw bootError;
    }
  }
  const storageStatus = await storageHealthStatus();
  if (runtime.kind === "postgres" && runtime.pool) {
    const env = getSourceEnvironment();
    lastHealth = {
      ...(await checkPostgresHealth(runtime.pool, {
        connectionString: env.appDatabaseUrl,
        sourceEnv: env.runtime,
      })),
      storage: storageStatus,
    };
  } else {
    lastHealth = { ...memoryHealth(), storage: storageStatus };
  }
  return runtime;
}

async function storageHealthStatus(): Promise<"ok" | "error"> {
  try {
    return await getRuntimeObjectStorage().health();
  } catch {
    return "error";
  }
}

function getRuntime(): RuntimePersistence {
  if (bootError) throw bootError;
  if (runtime) return runtime;
  if (isNextBuildPhase()) {
    runtime = { store: getMemoryPersistence(), kind: "memory" };
    lastHealth = memoryHealth();
    return runtime;
  }
  try {
    const env = loadSourceEnvironment();
    runtime = createRuntimePersistence(env);
    objectStorage = createRuntimeObjectStorage(env);
    emailProvider = createRuntimeEmailProvider(env);
  } catch (error) {
    bootError =
      error instanceof Error ? error : new SourceEnvironmentError("SOURCE runtime failed to start.");
    throw bootError;
  }
  lastHealth = runtime.kind === "memory" ? memoryHealth() : undefined;
  return runtime;
}
