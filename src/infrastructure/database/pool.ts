import { Pool, type PoolConfig } from "pg";

/**
 * Serverless (Vercel) uses a small pg pool against the Supabase transaction pooler
 * (port 6543). Migrations use a direct/session connection (port 5432).
 *
 * SET LOCAL / FOR UPDATE SKIP LOCKED stay inside BEGIN…COMMIT so they are
 * compatible with transaction-mode pooling. Never use session SET.
 *
 * Hosted TLS always verifies the server certificate (`rejectUnauthorized: true`).
 * Never set rejectUnauthorized to false. Pass the Supabase project CA via `ca`.
 */
export type PostgresPoolOptions = {
  ca?: string;
};

export type PostgresSslConfig = {
  rejectUnauthorized: true;
  ca?: string;
};

export function postgresSslConfig(connectionString: string, ca?: string): PostgresSslConfig | undefined {
  if (!requiresSsl(connectionString)) {
    return undefined;
  }
  if (ca) {
    return { rejectUnauthorized: true, ca };
  }
  return { rejectUnauthorized: true };
}

export function postgresPoolConfig(
  connectionString: string,
  kind: "app" | "migrator",
  options?: PostgresPoolOptions
): PoolConfig {
  const config: PoolConfig = {
    connectionString,
    max: kind === "migrator" ? 1 : Number(process.env.SOURCE_PG_POOL_MAX ?? 3),
    idleTimeoutMillis: kind === "app" ? 10_000 : 5_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  };
  const ssl = postgresSslConfig(connectionString, options?.ca);
  if (ssl) {
    config.ssl = ssl;
  }
  return config;
}

export function createPostgresPool(
  connectionString: string,
  kind: "app" | "migrator",
  options?: PostgresPoolOptions
): Pool {
  return new Pool(postgresPoolConfig(connectionString, kind, options));
}

export function requiresSsl(connectionString: string): boolean {
  const lower = connectionString.toLowerCase();
  if (lower.includes("sslmode=disable")) return false;
  if (lower.includes("sslmode=require") || lower.includes("sslmode=verify")) return true;
  return lower.includes("supabase.co") || lower.includes("supabase.com");
}
