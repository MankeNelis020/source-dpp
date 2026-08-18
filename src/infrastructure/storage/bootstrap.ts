/**
 * Create private SOURCE buckets. Storage is infrastructure, not the domain.
 *
 * Usage (migrator/operator machine, never from the browser):
 *   npm run storage:bootstrap
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for that project.
 * Preview service role must belong to the preview project; production to production.
 * This script never prints secret values.
 */
import { createClient } from "@supabase/supabase-js";
import { loadSourceEnvironment, SourceEnvironmentError } from "@/infrastructure/environment/source-environment";
import { EVIDENCE_BUCKET, IMPORT_BUCKET } from "./port";

const PRIVATE_BUCKETS = [IMPORT_BUCKET, EVIDENCE_BUCKET] as const;

async function main() {
  const env = loadSourceEnvironment();
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: SUPABASE_SERVICE_ROLE_KEY is required to bootstrap storage buckets."
    );
  }
  const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: existing, error: listError } = await client.storage.listBuckets();
  if (listError) {
    throw new SourceEnvironmentError("SOURCE storage bootstrap failed: could not list buckets.");
  }
  const names = new Set((existing ?? []).map((row) => row.name));
  for (const name of PRIVATE_BUCKETS) {
    if (names.has(name)) {
      const bucket = existing?.find((row) => row.name === name);
      if (bucket?.public) {
        throw new SourceEnvironmentError(
          `SOURCE storage bootstrap failed: bucket ${name} is public. Customer data buckets must be private.`
        );
      }
      continue;
    }
    const { error } = await client.storage.createBucket(name, {
      public: false,
      fileSizeLimit: 20 * 1024 * 1024,
    });
    if (error) {
      throw new SourceEnvironmentError(`SOURCE storage bootstrap failed: could not create private bucket ${name}.`);
    }
  }
  console.info(JSON.stringify({ event: "storage.bootstrap.ok", buckets: PRIVATE_BUCKETS, ts: new Date().toISOString() }));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "SOURCE storage bootstrap failed.";
  console.error(message);
  process.exit(1);
});
