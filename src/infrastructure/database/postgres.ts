import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { EngineState, PermissionState, Purpose, TrustLevel } from "@/domain/source/types";
import { emptyState, hydrateEngineState } from "@/domain/source";
import { hashesEqual } from "@/infrastructure/crypto/tokens";
import type { OutboxRecord, OutboxStatus } from "@/infrastructure/outbox/types";
import type {
  ImmutableAuditEvent,
  ImportJob,
  ImportJobEvent,
  ImportMappingProfile,
  Membership,
  Organisation,
  OrganisationInvitation,
  IdentityCommandRecord,
  ProcessedCommand,
  SupplierPortalGrant,
  UserRecord,
} from "@/server/source/types";
import type {
  EvidenceObject,
  PersistencePort,
  SessionRecord,
  ShareableTrustCandidate,
} from "./ports";

type Queryable = Pool | PoolClient;

export class PostgresPersistence implements PersistencePort {
  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient
  ) {}

  private q(sql: string, params: unknown[] = []) {
    return (this.client ?? this.pool).query(sql, params);
  }

  private async withTenant<T>(organisationId: string, fn: (client: Queryable) => Promise<T>): Promise<T> {
    if (this.client) {
      await this.setTenant(organisationId);
      return fn(this.client);
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('source.organisation_id', $1, true)", [organisationId]);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async setTenant(organisationId: string) {
    await this.q("SELECT set_config('source.organisation_id', $1, true)", [organisationId]);
  }

  nextId(prefix: string) {
    return `${prefix}-${randomUUID()}`;
  }

  async transaction<T>(fn: (tx: PersistencePort) => Promise<T> | T): Promise<T> {
    if (this.client) {
      return fn(this);
    }
    const client = await this.pool.connect();
    const tx = new PostgresPersistence(this.pool, client);
    try {
      await client.query("BEGIN");
      const result = await fn(tx);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getOrganisation(id: string) {
    const { rows } = await this.q(
      `SELECT id, name, slug, country, website, created_by AS "createdBy", created_at AS "createdAt"
       FROM organisations WHERE id = $1`,
      [id]
    );
    return rows[0] as Organisation | undefined;
  }

  async getOrganisationBySlug(slug: string) {
    const { rows } = await this.q(
      `SELECT id, name, slug, country, website, created_by AS "createdBy", created_at AS "createdAt"
       FROM organisations WHERE slug = $1`,
      [slug]
    );
    return rows[0] as Organisation | undefined;
  }

  async getUserById(id: string) {
    const { rows } = await this.q("SELECT id, email, display_name AS \"displayName\" FROM users WHERE id = $1", [id]);
    return rows[0] as UserRecord | undefined;
  }

  async getUserByEmail(email: string) {
    const { rows } = await this.q(
      "SELECT id, email, display_name AS \"displayName\" FROM users WHERE lower(email) = lower($1)",
      [email]
    );
    return rows[0] as UserRecord | undefined;
  }

  async getMembership(userId: string, organisationId: string) {
    const { rows } = await this.q(
      `SELECT id, user_id AS "userId", organisation_id AS "organisationId", role, capabilities,
              status, created_by AS "createdBy", created_at AS "createdAt"
       FROM memberships WHERE user_id = $1 AND organisation_id = $2`,
      [userId, organisationId]
    );
    return rows[0] as Membership | undefined;
  }

  async listMemberships(userId: string) {
    const { rows } = await this.q(
      `SELECT id, user_id AS "userId", organisation_id AS "organisationId", role, capabilities,
              status, created_by AS "createdBy", created_at AS "createdAt"
       FROM memberships WHERE user_id = $1`,
      [userId]
    );
    return rows as Membership[];
  }

  async saveOrganisation(org: Organisation) {
    await this.q(
      `INSERT INTO organisations (id, name, slug, country, website, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, country = EXCLUDED.country, website = EXCLUDED.website, created_by = COALESCE(EXCLUDED.created_by, organisations.created_by)`,
      [org.id, org.name, org.slug, org.country ?? null, org.website ?? null, org.createdBy ?? null]
    );
  }

  async saveUser(user: UserRecord) {
    await this.q(
      `INSERT INTO users (id, email, display_name)
       VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name`,
      [user.id, user.email, user.displayName]
    );
  }

  async saveMembership(membership: Membership) {
    await this.q(
      `INSERT INTO memberships (id, user_id, organisation_id, role, capabilities, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id, organisation_id) DO UPDATE SET
         role = EXCLUDED.role, capabilities = EXCLUDED.capabilities, status = EXCLUDED.status`,
      [
        membership.id,
        membership.userId,
        membership.organisationId,
        membership.role,
        membership.capabilities,
        membership.status ?? "ACTIVE",
        membership.createdBy ?? null,
      ]
    );
  }

  async listOrganisationMemberships(organisationId: string) {
    const { rows } = await this.q(
      `SELECT id, user_id AS "userId", organisation_id AS "organisationId", role, capabilities,
              status, created_by AS "createdBy", created_at AS "createdAt"
       FROM memberships WHERE organisation_id = $1`,
      [organisationId]
    );
    return rows as Membership[];
  }

  async countActiveOwners(organisationId: string) {
    const { rows } = await this.q(
      `SELECT count(*)::int AS n FROM memberships
       WHERE organisation_id = $1 AND role = 'OWNER' AND COALESCE(status, 'ACTIVE') <> 'SUSPENDED'`,
      [organisationId]
    );
    return Number(rows[0]?.n ?? 0);
  }

  async saveInvitation(invitation: OrganisationInvitation) {
    await this.withTenant(invitation.organisationId, async (client) => {
      await client.query(
        `INSERT INTO organisation_invitations
          (id, organisation_id, email_normalized, role, token_hash, expires_at, accepted_at, revoked_at, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           accepted_at = EXCLUDED.accepted_at, revoked_at = EXCLUDED.revoked_at`,
        [
          invitation.id,
          invitation.organisationId,
          invitation.emailNormalized,
          invitation.role,
          invitation.tokenHash,
          invitation.expiresAt,
          invitation.acceptedAt ?? null,
          invitation.revokedAt ?? null,
          invitation.createdBy,
          invitation.createdAt,
        ]
      );
    });
  }

  async findInvitationByTokenHash(hash: string) {
    const { rows } = await this.q("SELECT * FROM find_invitation_by_hash($1)", [hash]);
    const mapped = rows.map(mapInvitation);
    return mapped.find((row) => hashesEqual(row.tokenHash, hash));
  }

  async listInvitations(organisationId: string) {
    return this.withTenant(organisationId, async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM organisation_invitations WHERE organisation_id = $1 ORDER BY created_at",
        [organisationId]
      );
      return rows.map(mapInvitation);
    });
  }

  async findPendingInvitation(organisationId: string, emailNormalized: string) {
    return this.withTenant(organisationId, async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM organisation_invitations
         WHERE organisation_id = $1 AND email_normalized = $2 AND accepted_at IS NULL AND revoked_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [organisationId, emailNormalized]
      );
      return rows[0] ? mapInvitation(rows[0]) : undefined;
    });
  }

  async findIdentityCommand(userId: string, idempotencyKey: string) {
    const { rows } = await this.q(
      `SELECT user_id AS "userId", idempotency_key AS "idempotencyKey", command_type AS "commandType",
              organisation_id AS "organisationId", result_json AS result, processed_at AS "processedAt"
       FROM identity_commands WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, idempotencyKey]
    );
    return rows[0] as IdentityCommandRecord | undefined;
  }

  async saveIdentityCommand(record: IdentityCommandRecord) {
    await this.q(
      `INSERT INTO identity_commands (user_id, idempotency_key, command_type, organisation_id, result_json, processed_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)
       ON CONFLICT (user_id, idempotency_key) DO UPDATE SET
         organisation_id = COALESCE(EXCLUDED.organisation_id, identity_commands.organisation_id),
         result_json = CASE
           WHEN EXCLUDED.organisation_id IS NOT NULL THEN EXCLUDED.result_json
           ELSE identity_commands.result_json
         END,
         processed_at = EXCLUDED.processed_at`,
      [
        record.userId,
        record.idempotencyKey,
        record.commandType,
        record.organisationId ?? null,
        JSON.stringify(record.result),
        record.processedAt,
      ]
    );
  }

  /**
   * One JSONB aggregate per organisation. Inside a command transaction this row is
   * locked FOR UPDATE. That is the intended pilot design: simple and serializable.
   * Scale trigger: decompose only after profiling shows tenant-level lock contention
   * between independent commands. Do not normalize this snapshot preemptively.
   */
  async loadEngine(organisationId: string) {
    return this.withTenant(organisationId, async (client) => {
      const lock = this.client ? " FOR UPDATE" : "";
      const { rows } = await client.query(`SELECT state_json FROM engine_states WHERE organisation_id = $1${lock}`, [
        organisationId,
      ]);
      if (!rows[0]) {
        const org = await client.query("SELECT name FROM organisations WHERE id = $1", [organisationId]);
        return emptyState({ id: organisationId, name: org.rows[0]?.name ?? organisationId });
      }
      return hydrateEngineState(rows[0].state_json as EngineState);
    });
  }

  /**
   * Pilot: rewrite the whole shareable_trust_objects directory for the organisation.
   * Correct and cheap at pilot size. Scale trigger: at ~100k claims this DELETE+INSERT
   * becomes expensive and concurrency-sensitive — then switch to incremental /
   * event-driven upserts per claim. Do not rebuild that path before it is needed.
   */
  async saveEngine(organisationId: string, state: EngineState) {
    await this.withTenant(organisationId, async (client) => {
      const name = state.tenant.name || organisationId;
      await client.query(
        `INSERT INTO organisations (id, name, slug)
         VALUES ($1,$2,$3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [organisationId, name, organisationId]
      );
      await client.query(
        `INSERT INTO engine_states (organisation_id, state_json, version, updated_at)
         VALUES ($1, $2::jsonb, $3, now())
         ON CONFLICT (organisation_id) DO UPDATE SET state_json = EXCLUDED.state_json, version = engine_states.version + 1, updated_at = now()`,
        [organisationId, JSON.stringify(state), state.seq ?? 1]
      );
      await client.query("DELETE FROM shareable_trust_objects WHERE organisation_id = $1", [organisationId]);
      for (const claim of state.claims) {
        const evidence = claim.evidenceId ? state.evidence.find((item) => item.id === claim.evidenceId) : undefined;
        const permission = state.permissions.find((item) => item.claimId === claim.id);
        const networkVisible =
          claim.permissionState === "GRANTED" && evidence?.visibility !== "private" && !evidence?.expired;
        await client.query(
          `INSERT INTO shareable_trust_objects
            (id, organisation_id, subject_id, property_id, trust_level, permission_state, visibility, purpose, valid_until, expired, network_visible)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            `${organisationId}:${claim.id}`,
            organisationId,
            claim.subjectId,
            claim.propertyId,
            claim.trustLevel,
            claim.permissionState,
            permission?.visibility ?? null,
            claim.purpose,
            claim.validUntil ?? evidence?.validUntil ?? null,
            Boolean(evidence?.expired),
            networkVisible,
          ]
        );
      }
    });
  }

  async findProcessedCommand(organisationId: string, idempotencyKey: string) {
    return this.withTenant(organisationId, async (client) => {
      const { rows } = await client.query(
        "SELECT id, idempotency_key AS \"idempotencyKey\", organisation_id AS \"organisationId\", principal_id AS \"principalId\", command_type AS \"commandType\", result_json AS result, processed_at AS \"processedAt\" FROM processed_commands WHERE organisation_id = $1 AND idempotency_key = $2",
        [organisationId, idempotencyKey]
      );
      return rows[0] as ProcessedCommand | undefined;
    });
  }

  async saveProcessedCommand(record: ProcessedCommand) {
    await this.withTenant(record.organisationId, async (client) => {
      await client.query(
        `INSERT INTO processed_commands (id, idempotency_key, organisation_id, principal_id, command_type, result_json, processed_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
         ON CONFLICT (organisation_id, idempotency_key) DO NOTHING`,
        [
          record.id,
          record.idempotencyKey,
          record.organisationId,
          record.principalId,
          record.commandType,
          JSON.stringify(record.result),
          record.processedAt,
        ]
      );
    });
  }

  async findPortalGrantByTokenHash(hash: string) {
    const { rows } = await this.q("SELECT * FROM find_portal_grant_by_hash($1)", [hash]);
    const mapped = rows.map((row) => ({
      id: row.id,
      tokenHash: row.token_hash,
      actorId: row.actor_id,
      tenantContextId: row.tenant_context_id,
      allowedCaseIds: row.allowed_case_ids,
      allowedRequirementIds: row.allowed_requirement_ids,
      allowedCommands: row.allowed_commands,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at ?? undefined,
      createdAt: row.created_at,
    })) as SupplierPortalGrant[];
    return mapped.find((grant) => hashesEqual(grant.tokenHash, hash));
  }

  async savePortalGrant(grant: SupplierPortalGrant) {
    await this.withTenant(grant.tenantContextId, async (client) => {
      await client.query(
        `INSERT INTO supplier_portal_grants
          (id, token_hash, actor_id, tenant_context_id, allowed_case_ids, allowed_requirement_ids, allowed_commands, expires_at, revoked_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           token_hash = EXCLUDED.token_hash, allowed_case_ids = EXCLUDED.allowed_case_ids, revoked_at = EXCLUDED.revoked_at`,
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
    });
  }

  async listPortalGrantsForTenant(organisationId: string) {
    return this.withTenant(organisationId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, token_hash AS "tokenHash", actor_id AS "actorId", tenant_context_id AS "tenantContextId",
                allowed_case_ids AS "allowedCaseIds", allowed_requirement_ids AS "allowedRequirementIds",
                allowed_commands AS "allowedCommands", expires_at AS "expiresAt", revoked_at AS "revokedAt", created_at AS "createdAt"
         FROM supplier_portal_grants WHERE tenant_context_id = $1`,
        [organisationId]
      );
      return rows as SupplierPortalGrant[];
    });
  }

  async appendAudit(event: ImmutableAuditEvent) {
    const org = event.organisationId ?? "";
    await this.withTenant(org, async (client) => {
      await client.query(
        `INSERT INTO audit_events (
           id, organisation_id, principal_id, action, resource_type, resource_id, resource, result,
           policy_version, command_id, request_id, reason, detail, public_context, private_context, protected_references, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16::jsonb,$17)`,
        [
          event.id,
          event.organisationId ?? null,
          event.principalId ?? null,
          event.action,
          event.resourceType ?? null,
          event.resourceId ?? null,
          event.resource ?? null,
          event.result,
          event.policyVersion ?? null,
          event.commandId ?? null,
          event.requestId ?? null,
          event.reason ?? null,
          event.detail ?? null,
          JSON.stringify(event.publicContext ?? {}),
          event.privateContext ? JSON.stringify(event.privateContext) : null,
          event.protectedReferences ? JSON.stringify(event.protectedReferences) : null,
          event.createdAt,
        ]
      );
    });
  }

  async listAudit(organisationId: string) {
    return this.withTenant(organisationId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, organisation_id AS "organisationId", principal_id AS "principalId", action,
                resource_type AS "resourceType", resource_id AS "resourceId", resource, result,
                policy_version AS "policyVersion", command_id AS "commandId", request_id AS "requestId",
                reason, detail, public_context AS "publicContext", private_context AS "privateContext",
                protected_references AS "protectedReferences", created_at AS "createdAt"
         FROM audit_events WHERE organisation_id = $1 ORDER BY created_at`,
        [organisationId]
      );
      return rows as ImmutableAuditEvent[];
    });
  }

  async saveImportJob(job: ImportJob) {
    await this.withTenant(job.organisationId, async (client) => {
      await client.query(
        `INSERT INTO import_jobs (
           id, organisation_id, state, current_stage, processed_count, total_count, warning_count, error_count, review_count,
           started_at, completed_at, mapping, summary, raw_records
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           state = EXCLUDED.state, current_stage = EXCLUDED.current_stage, processed_count = EXCLUDED.processed_count,
           total_count = EXCLUDED.total_count, warning_count = EXCLUDED.warning_count, error_count = EXCLUDED.error_count,
           review_count = EXCLUDED.review_count, completed_at = EXCLUDED.completed_at, summary = EXCLUDED.summary,
           mapping = EXCLUDED.mapping, raw_records = EXCLUDED.raw_records`,
        [
          job.id,
          job.organisationId,
          job.state,
          job.currentStage ?? null,
          job.processedCount,
          job.totalCount,
          job.warningCount,
          job.errorCount,
          job.reviewCount,
          job.startedAt ?? null,
          job.completedAt ?? null,
          JSON.stringify(job.mapping ?? {}),
          job.summary ? JSON.stringify(job.summary) : null,
          job.rawRecords ? JSON.stringify(job.rawRecords) : null,
        ]
      );
    });
  }

  async getImportJob(id: string) {
    const { rows } = await this.q("SELECT * FROM find_import_job_by_id($1)", [id]);
    return rows[0] ? mapImportJob(rows[0]) : undefined;
  }

  async listImportJobs(organisationId: string) {
    return this.withTenant(organisationId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, organisation_id AS "organisationId", state FROM import_jobs WHERE organisation_id = $1`,
        [organisationId]
      );
      return rows as ImportJob[];
    });
  }

  async appendImportEvent(event: ImportJobEvent) {
    const job = await this.getImportJob(event.jobId);
    if (!job) return;
    await this.withTenant(job.organisationId, async (client) => {
      await client.query(
        "INSERT INTO import_job_events (id, job_id, type, payload, created_at) VALUES ($1,$2,$3,$4::jsonb,$5)",
        [event.id, event.jobId, event.type, JSON.stringify(event.payload), event.createdAt]
      );
    });
  }

  async listImportEvents(jobId: string) {
    const job = await this.getImportJob(jobId);
    if (!job) return [];
    return this.withTenant(job.organisationId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, job_id AS "jobId", type, payload, created_at AS "createdAt" FROM import_job_events WHERE job_id = $1 ORDER BY created_at`,
        [jobId]
      );
      return rows as ImportJobEvent[];
    });
  }

  async saveMappingProfile(profile: ImportMappingProfile) {
    await this.withTenant(profile.organisationId, async (client) => {
      await client.query(
        `INSERT INTO import_mapping_profiles (id, organisation_id, source_format, mapping, mapping_version, created_at, updated_at)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)
         ON CONFLICT (organisation_id, source_format) DO UPDATE SET
           mapping = EXCLUDED.mapping, mapping_version = EXCLUDED.mapping_version, updated_at = EXCLUDED.updated_at`,
        [
          profile.id,
          profile.organisationId,
          profile.sourceFormat,
          JSON.stringify(profile.mapping),
          profile.mappingVersion,
          profile.createdAt,
          profile.updatedAt,
        ]
      );
    });
  }

  async getMappingProfile(organisationId: string, sourceFormat: string) {
    return this.withTenant(organisationId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, organisation_id AS "organisationId", source_format AS "sourceFormat", mapping,
                mapping_version AS "mappingVersion", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM import_mapping_profiles WHERE organisation_id = $1 AND source_format = $2`,
        [organisationId, sourceFormat]
      );
      return rows[0] as ImportMappingProfile | undefined;
    });
  }

  async putEvidence(object: EvidenceObject) {
    const write = async (client: Queryable) => {
      await client.query(
        `INSERT INTO evidence_objects (
           evidence_id, owner_actor_id, organisation_id, storage_key, sha256, mime_type, size_bytes,
           original_filename, issuer, uploaded_by, created_at, valid_from, valid_until, visibility
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          object.evidenceId,
          object.ownerActorId,
          object.organisationId ?? null,
          object.storageKey,
          object.sha256,
          object.mimeType,
          object.size,
          object.originalFilename,
          object.issuer ?? null,
          object.uploadedBy ?? null,
          object.createdAt,
          object.validFrom ?? null,
          object.validUntil ?? null,
          object.visibility,
        ]
      );
    };
    if (object.organisationId) {
      await this.withTenant(object.organisationId, write);
      return;
    }
    await write(this.client ?? this.pool);
  }

  async getEvidence(evidenceId: string) {
    const { rows } = await this.q(
      `SELECT evidence_id AS "evidenceId", owner_actor_id AS "ownerActorId", organisation_id AS "organisationId",
              storage_key AS "storageKey", sha256, mime_type AS "mimeType", size_bytes AS size,
              original_filename AS "originalFilename", issuer, uploaded_by AS "uploadedBy", created_at AS "createdAt",
              valid_from AS "validFrom", valid_until AS "validUntil", visibility
       FROM evidence_objects WHERE evidence_id = $1`,
      [evidenceId]
    );
    return rows[0] as EvidenceObject | undefined;
  }

  async insertOutbox(record: OutboxRecord) {
    return this.withTenant(record.organisationId, async (client) => {
      const result = await client.query(
        `INSERT INTO outbox_events (
           id, organisation_id, event_type, aggregate_type, aggregate_id, semantic_key, payload, status, available_at, attempt_count, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)
         ON CONFLICT (organisation_id, semantic_key) DO NOTHING`,
        [
          record.id,
          record.organisationId,
          record.eventType,
          record.aggregateType,
          record.aggregateId,
          record.semanticKey,
          JSON.stringify(record.payload),
          record.status,
          record.availableAt,
          record.attemptCount,
          record.createdAt,
        ]
      );
      return (result.rowCount ?? 0) > 0;
    });
  }

  async claimOutboxBatch(limit: number) {
    const { rows } = await this.q("SELECT * FROM claim_outbox_batch($1)", [limit]);
    return rows.map(mapOutbox);
  }

  async markOutboxSucceeded(id: string, processedAt = new Date()) {
    await this.q("SELECT mark_outbox_succeeded($1, $2::timestamptz)", [id, processedAt.toISOString()]);
  }

  async markOutboxFailed(id: string, error: string, nextAttemptAt: Date, deadLetter = false) {
    await this.q("SELECT mark_outbox_failed($1, $2, $3::timestamptz, $4)", [
      id,
      error,
      nextAttemptAt.toISOString(),
      deadLetter,
    ]);
  }

  async getOutbox(id: string) {
    const { rows } = await this.q("SELECT * FROM find_outbox_by_id($1)", [id]);
    return rows[0] ? mapOutbox(rows[0]) : undefined;
  }

  async listOutbox(status?: OutboxStatus, organisationId?: string) {
    if (organisationId) {
      return this.withTenant(organisationId, async (client) => {
        const { rows } = await client.query(
          "SELECT * FROM outbox_events WHERE ($1::text IS NULL OR status = $1) AND organisation_id = $2",
          [status ?? null, organisationId]
        );
        return rows.map(mapOutbox);
      });
    }
    const { rows } = await this.q("SELECT * FROM outbox_events WHERE ($1::text IS NULL OR status = $1)", [status ?? null]);
    return rows.map(mapOutbox);
  }

  async countOutbox(status: OutboxStatus) {
    const { rows } = await this.q("SELECT count_outbox_by_status($1)::int AS n", [status]);
    return rows[0]?.n ?? 0;
  }

  async saveSession(session: SessionRecord) {
    await this.withTenant(session.organisationId, async (client) => {
      await client.query(
        `INSERT INTO sessions (id, user_id, organisation_id, expires_at, revoked_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET revoked_at = EXCLUDED.revoked_at`,
        [session.id, session.userId, session.organisationId, session.expiresAt, session.revokedAt ?? null, session.createdAt]
      );
    });
  }

  async getSession(id: string) {
    const { rows } = await this.q("SELECT * FROM get_session_by_id($1)", [id]);
    const row = rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.user_id,
      organisationId: row.organisation_id,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at ?? undefined,
      createdAt: row.created_at,
    } as SessionRecord;
  }

  async revokeSession(id: string, at = new Date()) {
    const session = await this.getSession(id);
    if (!session) return;
    await this.withTenant(session.organisationId, async (client) => {
      await client.query("UPDATE sessions SET revoked_at = $2 WHERE id = $1", [id, at.toISOString()]);
    });
  }

  async findShareableTrustCandidates(input: {
    requesterOrganisationId: string;
    subjectId: string;
    propertyId: string;
  }): Promise<ShareableTrustCandidate[]> {
    const { rows } = await this.q(
      `SELECT trust_level AS "trustLevel", permission_state AS "permissionState", visibility, purpose,
              valid_until AS "validUntil", expired
       FROM shareable_trust_directory
       WHERE subject_id = $1 AND property_id = $2`,
      [input.subjectId, input.propertyId]
    );
    return rows.map((row) => ({
      trustLevel: row.trustLevel as TrustLevel,
      permissionState: row.permissionState as PermissionState,
      visibility: row.visibility as ShareableTrustCandidate["visibility"],
      purpose: row.purpose as Purpose,
      validUntil: row.validUntil ?? undefined,
      expired: row.expired,
      identityMatched: true,
    }));
  }
}

function mapInvitation(row: Record<string, unknown>): OrganisationInvitation {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id ?? row.organisationId),
    emailNormalized: String(row.email_normalized ?? row.emailNormalized),
    role: (row.role as OrganisationInvitation["role"]) ?? "MEMBER",
    tokenHash: String(row.token_hash ?? row.tokenHash),
    expiresAt: String(row.expires_at ?? row.expiresAt),
    acceptedAt: (row.accepted_at ?? row.acceptedAt) as string | undefined,
    revokedAt: (row.revoked_at ?? row.revokedAt) as string | undefined,
    createdBy: String(row.created_by ?? row.createdBy),
    createdAt: String(row.created_at ?? row.createdAt),
  };
}

function mapImportJob(row: Record<string, unknown>): ImportJob {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id ?? row.organisationId),
    state: String(row.state) as ImportJob["state"],
    currentStage: (row.current_stage ?? row.currentStage) as ImportJob["currentStage"],
    processedCount: Number(row.processed_count ?? row.processedCount ?? 0),
    totalCount: Number(row.total_count ?? row.totalCount ?? 0),
    warningCount: Number(row.warning_count ?? row.warningCount ?? 0),
    errorCount: Number(row.error_count ?? row.errorCount ?? 0),
    reviewCount: Number(row.review_count ?? row.reviewCount ?? 0),
    startedAt: (row.started_at ?? row.startedAt) as string | undefined,
    completedAt: (row.completed_at ?? row.completedAt) as string | undefined,
    mapping: (row.mapping as ImportJob["mapping"]) ?? {},
    summary: (row.summary as ImportJob["summary"]) ?? undefined,
    rawRecords: (row.raw_records ?? row.rawRecords) as ImportJob["rawRecords"],
  };
}

function mapOutbox(row: Record<string, unknown>): OutboxRecord {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id ?? row.organisationId),
    eventType: String(row.event_type ?? row.eventType),
    aggregateType: String(row.aggregate_type ?? row.aggregateType),
    aggregateId: String(row.aggregate_id ?? row.aggregateId),
    semanticKey: String(row.semantic_key ?? row.semanticKey),
    payload: (row.payload as Record<string, unknown>) ?? {},
    status: (row.status as OutboxStatus) ?? "PENDING",
    availableAt: new Date(String(row.available_at ?? row.availableAt)).toISOString(),
    attemptCount: Number(row.attempt_count ?? row.attemptCount ?? 0),
    lastError: (row.last_error ?? row.lastError) as string | undefined,
    createdAt: new Date(String(row.created_at ?? row.createdAt)).toISOString(),
    processedAt: row.processed_at || row.processedAt ? new Date(String(row.processed_at ?? row.processedAt)).toISOString() : undefined,
  };
}
