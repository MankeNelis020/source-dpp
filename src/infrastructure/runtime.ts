import { getMemoryPersistence } from "@/infrastructure/database/memory";
import type { PersistencePort } from "@/infrastructure/database/ports";
import { getMemoryRateLimiter } from "@/infrastructure/rate-limit/memory";
import type { RateLimiter } from "@/infrastructure/rate-limit/port";
import { getMemoryEvidenceStorage } from "@/infrastructure/storage/evidence";
import type { EvidenceStorage } from "@/infrastructure/storage/evidence";

let postgresStore: PersistencePort | undefined;
let postgresLimiter: RateLimiter | undefined;

export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPersistence(): PersistencePort {
  if (process.env.DATABASE_URL && postgresStore) return postgresStore;
  return getMemoryPersistence();
}

export function setPersistenceForRuntime(store: PersistencePort) {
  postgresStore = store;
}

export function getRuntimeRateLimiter(): RateLimiter {
  return postgresLimiter ?? getMemoryRateLimiter();
}

export function setRuntimeRateLimiter(limiter: RateLimiter) {
  postgresLimiter = limiter;
}

export function getRuntimeEvidenceStorage(): EvidenceStorage {
  return getMemoryEvidenceStorage();
}

export function demoAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.SOURCE_DEMO_AUTH === "1";
}
