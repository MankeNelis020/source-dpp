import { Pool } from "pg";
import { MemoryPersistence } from "./memory";
import { PostgresPersistence } from "./postgres";
import { applyMigrations } from "./migrate";
import { ROLE_CAPABILITIES } from "@/server/source/authorization";

export function requireDatabaseUrl() {
  const url = process.env.SOURCE_MIGRATOR_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    if (process.env.CI || process.env.SOURCE_REQUIRE_POSTGRES === "1") {
      throw new Error("DATABASE_URL is required for Postgres integration tests. Refusing to skip isolation tests.");
    }
    return undefined;
  }
  return url;
}

export function runtimeAppDatabaseUrl(migratorUrl: string) {
  if (process.env.SOURCE_APP_DATABASE_URL) return process.env.SOURCE_APP_DATABASE_URL;
  const parsed = new URL(migratorUrl);
  parsed.username = "source_app";
  parsed.password = "source_app_dev_only";
  return parsed.toString();
}

export async function createMigratorPool() {
  const url = requireDatabaseUrl();
  if (!url) return undefined;
  return new Pool({ connectionString: url });
}

export async function createAppPool() {
  const migrator = requireDatabaseUrl();
  if (!migrator) return undefined;
  return new Pool({ connectionString: runtimeAppDatabaseUrl(migrator) });
}

export async function resetAndSeedPostgres(migrator: Pool) {
  await applyMigrations(migrator);
  await migrator.query(`
    TRUNCATE
      identity_commands, organisation_invitations,
      inbound_email_events, inbound_correlations,
      email_provider_events, outbound_messages,
      outbox_events, rate_limit_windows, shareable_trust_objects, audit_events, processed_commands,
      import_job_events, import_jobs, evidence_objects, storage_objects, sessions, supplier_portal_grants,
      engine_states, memberships, users, organisations
    RESTART IDENTITY CASCADE
  `);
  const memory = new MemoryPersistence();
  for (const org of memory.organisations.values()) {
    await migrator.query("INSERT INTO organisations (id, name, slug) VALUES ($1,$2,$3)", [org.id, org.name, org.slug]);
  }
  for (const user of memory.users.values()) {
    await migrator.query("INSERT INTO users (id, email, display_name) VALUES ($1,$2,$3)", [
      user.id,
      user.email,
      user.displayName,
    ]);
  }
  for (const membership of memory.memberships) {
    await migrator.query(
      "INSERT INTO memberships (id, user_id, organisation_id, role, capabilities, status) VALUES ($1,$2,$3,$4,$5,$6)",
      [
        membership.id,
        membership.userId,
        membership.organisationId,
        membership.role,
        membership.capabilities.length ? membership.capabilities : ROLE_CAPABILITIES[membership.role],
        membership.status ?? "ACTIVE",
      ]
    );
  }
  for (const [orgId, state] of memory.engines) {
    await migrator.query("INSERT INTO engine_states (organisation_id, state_json) VALUES ($1,$2::jsonb)", [
      orgId,
      JSON.stringify(state),
    ]);
  }
  for (const grant of memory.portalGrants) {
    await migrator.query(
      `INSERT INTO supplier_portal_grants
        (id, token_hash, actor_id, tenant_context_id, allowed_case_ids, allowed_requirement_ids, allowed_commands, expires_at, revoked_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        grant.id,
        grant.tokenHash,
        grant.actorId,
        grant.tenantContextId,
        grant.allowedCaseIds,
        grant.allowedRequirementIds,
        grant.allowedCommands,
        grant.expiresAt,
        grant.revokedAt ?? null,
        grant.createdAt,
      ]
    );
  }
}

export async function postgresAppStore(app: Pool) {
  return new PostgresPersistence(app);
}
