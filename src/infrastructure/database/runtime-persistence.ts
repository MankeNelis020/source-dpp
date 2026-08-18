import { getMemoryPersistence } from "@/infrastructure/database/memory";
import { createPostgresPool } from "@/infrastructure/database/pool";
import { PostgresPersistence } from "@/infrastructure/database/postgres";
import { PostgresRateLimiter } from "@/infrastructure/rate-limit/postgres";
import type { PersistencePort } from "@/infrastructure/database/ports";
import type { RateLimiter } from "@/infrastructure/rate-limit/port";
import {
  SourceEnvironmentError,
  type SourceEnvironment,
} from "@/infrastructure/environment/source-environment";
import type { Pool } from "pg";

export interface RuntimePersistence {
  store: PersistencePort;
  kind: "memory" | "postgres";
  pool?: Pool;
  rateLimiter?: RateLimiter;
}

/**
 * Authoritative runtime persistence factory. Routes and UI must not choose
 * MemoryPersistence vs PostgresPersistence themselves.
 */
export function createRuntimePersistence(env: SourceEnvironment): RuntimePersistence {
  if (env.persistence === "memory") {
    if (env.runtime === "preview" || env.runtime === "production") {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: memory persistence is not allowed in preview or production."
      );
    }
    return { store: getMemoryPersistence(), kind: "memory" };
  }

  if (!env.appDatabaseUrl) {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: SOURCE_APP_DATABASE_URL is required."
    );
  }

  if ((env.runtime === "preview" || env.runtime === "production") && !env.supabaseDbCaCert) {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: SUPABASE_DB_CA_CERT is required for hosted Postgres TLS."
    );
  }

  const pool = createPostgresPool(env.appDatabaseUrl, "app", { ca: env.supabaseDbCaCert });
  return {
    store: new PostgresPersistence(pool),
    kind: "postgres",
    pool,
    rateLimiter: new PostgresRateLimiter(pool),
  };
}
