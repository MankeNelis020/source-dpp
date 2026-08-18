import { getMemoryPersistence } from "@/infrastructure/database/memory";
import { checkPostgresHealth, memoryHealth, type PersistenceHealth } from "@/infrastructure/database/health";
import { createRuntimePersistence, type RuntimePersistence } from "@/infrastructure/database/runtime-persistence";
import type { PersistencePort } from "@/infrastructure/database/ports";
import { getMemoryRateLimiter } from "@/infrastructure/rate-limit/memory";
import type { RateLimiter } from "@/infrastructure/rate-limit/port";
import { getMemoryEvidenceStorage } from "@/infrastructure/storage/evidence";
import type { EvidenceStorage } from "@/infrastructure/storage/evidence";
import {
  isNextBuildPhase,
  loadSourceEnvironment,
  SourceEnvironmentError,
  type SourceEnvironment,
} from "@/infrastructure/environment/source-environment";

let runtime: RuntimePersistence | undefined;
let lastHealth: PersistenceHealth | undefined;
let bootError: Error | undefined;

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

export function getRuntimeEvidenceStorage(): EvidenceStorage {
  return getMemoryEvidenceStorage();
}

export function getPersistenceHealth(): PersistenceHealth {
  if (lastHealth) return lastHealth;
  return getRuntime().kind === "postgres"
    ? { database: "error", persistence: "postgres" }
    : memoryHealth();
}

export function resetRuntimeForTests() {
  runtime = undefined;
  lastHealth = undefined;
  bootError = undefined;
}

export function demoAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.SOURCE_DEMO_AUTH === "1";
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
      runtime = createRuntimePersistence(loadSourceEnvironment());
    } catch (error) {
      bootError =
        error instanceof Error ? error : new SourceEnvironmentError("SOURCE runtime failed to start.");
      throw bootError;
    }
  }
  if (runtime.kind === "postgres" && runtime.pool) {
    lastHealth = await checkPostgresHealth(runtime.pool);
  } else {
    lastHealth = memoryHealth();
  }
  return runtime;
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
    runtime = createRuntimePersistence(loadSourceEnvironment());
  } catch (error) {
    bootError =
      error instanceof Error ? error : new SourceEnvironmentError("SOURCE runtime failed to start.");
    throw bootError;
  }
  lastHealth = runtime.kind === "memory" ? memoryHealth() : undefined;
  return runtime;
}
