import { resetAndSeedPostgres } from "./seed-postgres";
import { createPostgresPool } from "./pool";
import {
  loadSourceEnvironment,
  SourceEnvironmentError,
  roleName,
  postgresUrlUser,
} from "../environment/source-environment";

async function main() {
  const env = loadSourceEnvironment();
  if (env.runtime !== "local") {
    throw new SourceEnvironmentError("db:seed is for local/demo only. Preview and production must boot without seeded Acme state.");
  }
  const url = env.migratorDatabaseUrl ?? process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new SourceEnvironmentError("SOURCE_MIGRATOR_DATABASE_URL is required to seed local Postgres.");
  }
  if (roleName(postgresUrlUser(url)) === "source_app") {
    throw new SourceEnvironmentError("db:seed must use migrator credentials, not source_app.");
  }
  const pool = createPostgresPool(url, "migrator", { ca: env.supabaseDbCaCert });
  try {
    await resetAndSeedPostgres(pool);
    console.log("SOURCE local demo seed applied. This must not run in preview or production.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const message =
    error instanceof SourceEnvironmentError ? error.message : "SOURCE seed failed. Credentials were not printed.";
  console.error(message);
  process.exit(1);
});
