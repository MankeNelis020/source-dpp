import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";
import { SourceEnvironmentError } from "@/infrastructure/environment/source-environment";

export interface MigrationResult {
  applied: string[];
  already: string[];
  current?: string;
}

export async function applyMigrations(pool: Pool): Promise<MigrationResult> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const dir = path.join(process.cwd(), "src/infrastructure/database/migrations");
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const applied: string[] = [];
  const already: string[] = [];
  for (const file of files) {
    const existing = await pool.query("SELECT 1 FROM schema_migrations WHERE id = $1", [file]);
    if (existing.rowCount) {
      already.push(file);
      continue;
    }
    const sql = readFileSync(path.join(dir, file), "utf8");
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      await pool.query("COMMIT");
      applied.push(file);
    } catch (error) {
      await pool.query("ROLLBACK");
      throw new SourceEnvironmentError(safeMigrationFailure(file, error));
    }
  }
  const current = files.at(-1);
  return { applied, already, current };
}

function safeMigrationFailure(file: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : "unknown error";
  if (/postgres(?:ql)?:\/\//i.test(raw) || /password=/i.test(raw)) {
    return `SOURCE migration failed at ${file}. Credentials were not printed.`;
  }
  return `SOURCE migration failed at ${file}: ${raw}`;
}
