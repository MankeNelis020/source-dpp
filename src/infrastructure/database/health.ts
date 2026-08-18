import type { Pool, PoolClient } from "pg";
import { SourceEnvironmentError } from "@/infrastructure/environment/source-environment";
import type { PersistenceAdapterKind } from "@/infrastructure/environment/source-environment";
import {
  logPostgresHealthFailure,
  safePostgresFailureDiagnostics,
  type PostgresConnectionPhase,
} from "@/infrastructure/database/postgres-diagnostics";

export interface PersistenceHealth {
  database: "ok" | "error";
  persistence: PersistenceAdapterKind;
  storage?: "ok" | "error";
  email?: "configured" | "unconfigured" | "test";
  outboxBacklog?: number;
}

export type PostgresHealthContext = {
  connectionString?: string;
  sourceEnv?: string;
};

export async function checkPostgresHealth(
  pool: Pool,
  context: PostgresHealthContext = {}
): Promise<PersistenceHealth> {
  const connectionString = context.connectionString ?? pool.options?.connectionString;
  const sourceEnv = context.sourceEnv;
  let phase: PostgresConnectionPhase = "connect";
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    phase = "query";
    await client.query("SELECT 1");
    const role = await client.query<{ u: string }>("SELECT current_user AS u");
    if (role.rows[0]?.u !== "source_app") {
      throw new SourceEnvironmentError(
        "SOURCE persistence health check failed: runtime role is not source_app."
      );
    }
    const migrations = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM schema_migrations");
    if (!migrations.rows[0] || migrations.rows[0].n < 1) {
      throw new SourceEnvironmentError(
        "SOURCE persistence health check failed: required schema is not present."
      );
    }
    await client.query("SELECT 1 FROM engine_states LIMIT 0");
    await client.query("SELECT 1 FROM processed_commands LIMIT 0");
    await client.query("SELECT 1 FROM audit_events LIMIT 0");
    await client.query("SELECT 1 FROM outbox_events LIMIT 0");
    await client.query("SELECT 1 FROM import_jobs LIMIT 0");
    await client.query("SELECT 1 FROM organisations LIMIT 0");
    await client.query("SELECT 1 FROM storage_objects LIMIT 0");
    await client.query("SELECT 1 FROM outbound_messages LIMIT 0");
    return { database: "ok", persistence: "postgres", storage: "ok" };
  } catch (error) {
    logPostgresHealthFailure(
      safePostgresFailureDiagnostics({
        error,
        phase,
        connectionString,
        sourceEnv,
      })
    );
    if (error instanceof SourceEnvironmentError) throw error;
    throw new SourceEnvironmentError("SOURCE persistence health check failed: database unreachable.");
  } finally {
    client?.release();
  }
}

export function memoryHealth(): PersistenceHealth {
  return { database: "ok", persistence: "memory", storage: "ok" };
}
