import { createPostgresPool } from "./pool";
import { applyMigrations } from "./migrate";
import {
  loadSourceEnvironment,
  SourceEnvironmentError,
} from "../environment/source-environment";

async function main() {
  const env = loadSourceEnvironment(process.env, { mode: "migrator" });
  const url = env.migratorDatabaseUrl;
  if (!url) {
    throw new SourceEnvironmentError(
      "SOURCE_MIGRATOR_DATABASE_URL is required to apply migrations. Do not use SOURCE_APP_DATABASE_URL for DDL."
    );
  }
  const pool = createPostgresPool(url, "migrator", { ca: env.supabaseDbCaCert });
  try {
    const result = await applyMigrations(pool);
    const applied = result.applied.length ? result.applied.join(", ") : "(none)";
    const already = result.already.length ? result.already.join(", ") : "(none)";
    console.log(`SOURCE migrations applied: ${applied}`);
    console.log(`SOURCE migrations already present: ${already}`);
    console.log(`SOURCE migration current version: ${result.current ?? "(none)"}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const message =
    error instanceof SourceEnvironmentError ? error.message : "SOURCE migration failed. Credentials were not printed.";
  console.error(message);
  process.exit(1);
});
