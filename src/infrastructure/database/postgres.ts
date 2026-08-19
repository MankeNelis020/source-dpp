import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { EngineState, PermissionState, Purpose, TrustLevel } from "@/domain/source/types";
import { emptyState, hydrateEngineState } from "@/domain/source";
import { hashesEqual } from "@/infrastructure/crypto/tokens";
import type { OutboxRecord, OutboxStatus } from "@/infrastructure/outbox/types";
import type { EmailProviderEventRecord, InboundCorrelationRecord, InboundEmailEventRecord, OutboundMessageRecord, TransportStatus } from "@/infrastructure/email/transport";
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
  StorageObjectRecord,
} from "./ports";
import { normalizeTimestamp, requireTimestamp, type TimestampInput } from "./timestamps";

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
          requireTimestamp(invitation.expiresAt),
          normalizeTimestamp(invitation.acceptedAt),
          normalizeTimestamp(invitation.revokedAt),
          invitation.createdBy,
          requireTimestamp(invitation.createdAt),
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
  async listOrganisationIds() {
    const { rows } = await this.q("SELECT id FROM list_organisation_ids()");
    return rows.map((row) => String(row.id));
  }

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
      expiresAt: requireTimestamp(row.expires_at),
      revokedAt: normalizeTimestamp(row.revoked_at) ?? undefined,
      createdAt: requireTimestamp(row.created_at),
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
          requireTimestamp(grant.expiresAt),
          normalizeTimestamp(grant.revokedAt),
          requireTimestamp(grant.createdAt),
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
          requireTimestamp(event.createdAt),
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
           started_at, completed_at, mapping, summary, raw_records, source_storage_object_ids, source_files
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           state = EXCLUDED.state, current_stage = EXCLUDED.current_stage, processed_count = EXCLUDED.processed_count,
           total_count = EXCLUDED.total_count, warning_count = EXCLUDED.warning_count, error_count = EXCLUDED.error_count,
           review_count = EXCLUDED.review_count, completed_at = EXCLUDED.completed_at, summary = EXCLUDED.summary,
           mapping = EXCLUDED.mapping, raw_records = EXCLUDED.raw_records,
           source_storage_object_ids = EXCLUDED.source_storage_object_ids, source_files = EXCLUDED.source_files`,
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
          job.sourceStorageObjectIds ? JSON.stringify(job.sourceStorageObjectIds) : null,
          job.sourceFiles ? JSON.stringify(job.sourceFiles) : null,
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
        `SELECT id, organisation_id AS "organisationId", state, current_stage AS "currentStage",
                processed_count AS "processedCount", total_count AS "totalCount",
                warning_count AS "warningCount", error_count AS "errorCount", review_count AS "reviewCount",
                started_at AS "startedAt", completed_at AS "completedAt", mapping, summary,
                source_storage_object_ids AS "sourceStorageObjectIds", source_files AS "sourceFiles"
         FROM import_jobs WHERE organisation_id = $1 ORDER BY started_at DESC NULLS LAST`,
        [organisationId]
      );
      return rows.map((row) => mapImportJob(row as Record<string, unknown>));
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
           original_filename, issuer, uploaded_by, created_at, valid_from, valid_until, visibility,
           storage_object_id, availability, supersedes_evidence_id, uploaded_via_portal_grant_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
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
          object.storageObjectId ?? null,
          object.availability ?? null,
          object.supersedesEvidenceId ?? null,
          object.uploadedViaPortalGrantId ?? null,
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
              valid_from AS "validFrom", valid_until AS "validUntil", visibility,
              storage_object_id AS "storageObjectId", availability,
              supersedes_evidence_id AS "supersedesEvidenceId",
              uploaded_via_portal_grant_id AS "uploadedViaPortalGrantId"
       FROM evidence_objects WHERE evidence_id = $1`,
      [evidenceId]
    );
    return rows[0] as EvidenceObject | undefined;
  }

  async saveStorageObject(object: StorageObjectRecord) {
    const timestamps = storageObjectWriteTimestamps(object);
    await this.withTenant(object.organisationId, async (client) => {
      await client.query(
        `INSERT INTO storage_objects (
           id, organisation_id, bucket, object_key, purpose, availability, original_filename, mime_type, size_bytes,
           sha256, created_by_principal_id, created_via_portal_grant_id, case_id, requirement_id, evidence_id,
           scan_status, expires_at, deleted_at, created_at, finalized_at, supersedes_storage_object_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         ON CONFLICT (id) DO UPDATE SET
           purpose = EXCLUDED.purpose, availability = EXCLUDED.availability, mime_type = EXCLUDED.mime_type,
           size_bytes = EXCLUDED.size_bytes, sha256 = EXCLUDED.sha256, scan_status = EXCLUDED.scan_status,
           expires_at = EXCLUDED.expires_at, deleted_at = EXCLUDED.deleted_at, finalized_at = EXCLUDED.finalized_at,
           evidence_id = EXCLUDED.evidence_id, case_id = EXCLUDED.case_id, requirement_id = EXCLUDED.requirement_id`,
        [
          object.id,
          object.organisationId,
          object.bucket,
          object.objectKey,
          object.purpose,
          object.availability,
          object.originalFilename,
          object.mimeType ?? null,
          object.sizeBytes ?? null,
          object.sha256 ?? null,
          object.createdByPrincipalId ?? null,
          object.createdViaPortalGrantId ?? null,
          object.caseId ?? null,
          object.requirementId ?? null,
          object.evidenceId ?? null,
          object.scanStatus,
          timestamps.expiresAt,
          timestamps.deletedAt,
          timestamps.createdAt,
          timestamps.finalizedAt,
          object.supersedesStorageObjectId ?? null,
        ]
      );
    });
  }

  async getStorageObject(id: string) {
    const { rows } = await this.q("SELECT * FROM find_storage_object_by_id($1)", [id]);
    const row = rows[0];
    if (!row) return undefined;
    const mapped = mapStorageObject(row as Record<string, unknown>);
    if (mapped.deletedAt) return undefined;
    return this.withTenant(mapped.organisationId, async () => mapped);
  }

  async listStorageObjects(organisationId: string) {
    return this.withTenant(organisationId, async (client) => {
      const { rows } = await client.query(`SELECT * FROM storage_objects WHERE organisation_id = $1 AND deleted_at IS NULL`, [
        organisationId,
      ]);
      return rows.map((row) => mapStorageObject(row as Record<string, unknown>));
    });
  }

  async listExpiredTemporaryUploads(now = new Date()) {
    const { rows } = await this.q("SELECT * FROM list_expired_temporary_uploads($1)", [now.toISOString()]);
    return rows.map((row) => mapStorageObject(row as Record<string, unknown>));
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
          requireTimestamp(record.availableAt),
          record.attemptCount,
          requireTimestamp(record.createdAt),
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

  async updateOutboxPayload(id: string, payload: Record<string, unknown>) {
    await this.q("SELECT update_outbox_payload($1, $2::jsonb)", [id, JSON.stringify(payload)]);
  }

  async resetOutboxForRetry(id: string, availableAt = new Date()) {
    const { rows } = await this.q("SELECT reset_outbox_for_retry($1, $2::timestamptz) AS ok", [
      id,
      availableAt.toISOString(),
    ]);
    return Boolean(rows[0]?.ok);
  }

  async saveOutboundMessage(record: OutboundMessageRecord) {
    await this.withTenant(record.organisationId, async (client) => {
      await client.query(
        `INSERT INTO outbound_messages (
           id, organisation_id, case_id, request_id, supplier_actor_id, portal_grant_id, outbox_event_id,
           semantic_key, recipient, from_address, template_id, template_version, category, provider,
           provider_message_id, transport_status, token_fingerprint, created_at, provider_accepted_at,
           delivered_at, bounced_at, complained_at, last_provider_event_at, last_error
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
         )
         ON CONFLICT (id) DO UPDATE SET
           provider_message_id = EXCLUDED.provider_message_id,
           transport_status = EXCLUDED.transport_status,
           provider_accepted_at = EXCLUDED.provider_accepted_at,
           delivered_at = EXCLUDED.delivered_at,
           bounced_at = EXCLUDED.bounced_at,
           complained_at = EXCLUDED.complained_at,
           last_provider_event_at = EXCLUDED.last_provider_event_at,
           last_error = EXCLUDED.last_error,
           portal_grant_id = EXCLUDED.portal_grant_id`,
        [
          record.id,
          record.organisationId,
          record.caseId ?? null,
          record.requestId ?? null,
          record.supplierActorId ?? null,
          record.portalGrantId ?? null,
          record.outboxEventId,
          record.semanticKey,
          record.recipient,
          record.fromAddress,
          record.templateId,
          record.templateVersion,
          record.category,
          record.provider,
          record.providerMessageId ?? null,
          record.transportStatus,
          record.tokenFingerprint ?? null,
          record.createdAt,
          record.providerAcceptedAt ?? null,
          record.deliveredAt ?? null,
          record.bouncedAt ?? null,
          record.complainedAt ?? null,
          record.lastProviderEventAt ?? null,
          record.lastError ?? null,
        ]
      );
    });
  }

  async getOutboundMessage(id: string) {
    const { rows } = await this.q("SELECT * FROM find_outbound_message_by_id($1)", [id]);
    return rows[0] ? mapOutboundMessage(rows[0]) : undefined;
  }

  async getOutboundMessageBySemanticKey(organisationId: string, semanticKey: string) {
    return this.withTenant(organisationId, async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM outbound_messages WHERE organisation_id = $1 AND semantic_key = $2",
        [organisationId, semanticKey]
      );
      return rows[0] ? mapOutboundMessage(rows[0]) : undefined;
    });
  }

  async getOutboundMessageByProviderId(provider: string, providerMessageId: string) {
    const { rows } = await this.q("SELECT * FROM find_outbound_message_by_provider_id($1, $2)", [
      provider,
      providerMessageId,
    ]);
    return rows[0] ? mapOutboundMessage(rows[0]) : undefined;
  }

  async listOutboundMessages(organisationId: string, caseId?: string) {
    return this.withTenant(organisationId, async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM outbound_messages WHERE organisation_id = $1 AND ($2::text IS NULL OR case_id = $2) ORDER BY created_at",
        [organisationId, caseId ?? null]
      );
      return rows.map((row) => mapOutboundMessage(row));
    });
  }

  async insertEmailProviderEvent(record: EmailProviderEventRecord) {
    const { rows } = await this.q(
      "SELECT insert_email_provider_event($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz) AS ok",
      [
        record.id,
        record.organisationId ?? null,
        record.outboundMessageId ?? null,
        record.provider,
        record.providerEventId,
        record.providerMessageId ?? null,
        record.eventType,
        record.occurredAt,
        record.processedAt,
      ]
    );
    return Boolean(rows[0]?.ok);
  }

  async getEmailProviderEvent(provider: string, providerEventId: string) {
    const { rows } = await this.q("SELECT * FROM find_email_provider_event($1, $2)", [provider, providerEventId]);
    return rows[0] ? mapProviderEvent(rows[0]) : undefined;
  }

  async saveInboundCorrelation(record: InboundCorrelationRecord) {
    await this.withTenant(record.organisationId, async (client) => {
      await client.query(
        `INSERT INTO inbound_correlations (id, organisation_id, case_id, request_id, token_hash, created_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
        [
          record.id,
          record.organisationId,
          record.caseId,
          record.requestId ?? null,
          record.tokenHash,
          requireTimestamp(record.createdAt),
          requireTimestamp(record.expiresAt),
        ]
      );
    });
  }

  async findInboundCorrelationByTokenHash(hash: string) {
    const { rows } = await this.q("SELECT * FROM find_inbound_correlation_by_hash($1)", [hash]);
    if (!rows[0]) return undefined;
    const row = rows[0] as Record<string, unknown>;
    return {
      id: String(row.id),
      organisationId: String(row.organisation_id ?? row.organisationId),
      caseId: String(row.case_id ?? row.caseId),
      requestId: (row.request_id ?? row.requestId) as string | undefined,
      tokenHash: String(row.token_hash ?? row.tokenHash),
      createdAt: requireTimestamp(row.created_at ?? row.createdAt),
      expiresAt: requireTimestamp(row.expires_at ?? row.expiresAt),
    };
  }

  async insertInboundEmailEvent(record: InboundEmailEventRecord) {
    const { rows } = await this.q(
      "SELECT insert_inbound_email_event($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10) AS ok",
      [
        record.id,
        record.provider,
        record.providerEventId,
        record.organisationId ?? null,
        record.caseId ?? null,
        record.correlationId ?? null,
        record.fromNormalized ?? null,
        record.occurredAt,
        record.processedAt,
        record.disposition,
      ]
    );
    return Boolean(rows[0]?.ok);
  }

  async saveSession(session: SessionRecord) {
    await this.withTenant(session.organisationId, async (client) => {
      await client.query(
        `INSERT INTO sessions (id, user_id, organisation_id, expires_at, revoked_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET revoked_at = EXCLUDED.revoked_at`,
        [session.id, session.userId, session.organisationId, requireTimestamp(session.expiresAt), normalizeTimestamp(session.revokedAt), requireTimestamp(session.createdAt)]
      );
    });
  }

  async getSession(id: string) {
    const { rows } = await this.q("SELECT * FROM get_session_by_id($1)", [id]);
    const row = rows[0];
    if (!row) return undefined;
    return {
      id: String(row.id),
      userId: String(row.user_id ?? row.userId),
      organisationId: String(row.organisation_id ?? row.organisationId),
      expiresAt: requireTimestamp(row.expires_at ?? row.expiresAt),
      revokedAt: normalizeTimestamp(row.revoked_at ?? row.revokedAt) ?? undefined,
      createdAt: requireTimestamp(row.created_at ?? row.createdAt),
    };
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
    expiresAt: requireTimestamp(row.expires_at ?? row.expiresAt),
    acceptedAt: normalizeTimestamp(row.accepted_at ?? row.acceptedAt) ?? undefined,
    revokedAt: normalizeTimestamp(row.revoked_at ?? row.revokedAt) ?? undefined,
    createdBy: String(row.created_by ?? row.createdBy),
    createdAt: requireTimestamp(row.created_at ?? row.createdAt),
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
    startedAt: normalizeTimestamp(row.started_at ?? row.startedAt) ?? undefined,
    completedAt: normalizeTimestamp(row.completed_at ?? row.completedAt) ?? undefined,
    mapping: (row.mapping as ImportJob["mapping"]) ?? {},
    summary: (row.summary as ImportJob["summary"]) ?? undefined,
    rawRecords: (row.raw_records ?? row.rawRecords) as ImportJob["rawRecords"],
    sourceStorageObjectIds: (row.source_storage_object_ids ?? row.sourceStorageObjectIds) as ImportJob["sourceStorageObjectIds"],
    sourceFiles: (row.source_files ?? row.sourceFiles) as ImportJob["sourceFiles"],
  };
}

export function storageObjectWriteTimestamps(object: {
  createdAt: TimestampInput;
  expiresAt?: TimestampInput;
  deletedAt?: TimestampInput;
  finalizedAt?: TimestampInput;
}) {
  return {
    expiresAt: normalizeTimestamp(object.expiresAt),
    deletedAt: normalizeTimestamp(object.deletedAt),
    createdAt: requireTimestamp(object.createdAt),
    finalizedAt: normalizeTimestamp(object.finalizedAt),
  };
}

export function mapStorageObject(row: Record<string, unknown>): StorageObjectRecord {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id ?? row.organisationId),
    bucket: String(row.bucket),
    objectKey: String(row.object_key ?? row.objectKey),
    purpose: String(row.purpose) as StorageObjectRecord["purpose"],
    availability: String(row.availability) as StorageObjectRecord["availability"],
    originalFilename: String(row.original_filename ?? row.originalFilename),
    mimeType: (row.mime_type ?? row.mimeType) as string | undefined,
    sizeBytes: row.size_bytes != null || row.sizeBytes != null ? Number(row.size_bytes ?? row.sizeBytes) : undefined,
    sha256: (row.sha256 as string | undefined) ?? undefined,
    createdByPrincipalId: (row.created_by_principal_id ?? row.createdByPrincipalId) as string | undefined,
    createdViaPortalGrantId: (row.created_via_portal_grant_id ?? row.createdViaPortalGrantId) as string | undefined,
    caseId: (row.case_id ?? row.caseId) as string | undefined,
    requirementId: (row.requirement_id ?? row.requirementId) as string | undefined,
    evidenceId: (row.evidence_id ?? row.evidenceId) as string | undefined,
    scanStatus: String(row.scan_status ?? row.scanStatus ?? "PENDING") as StorageObjectRecord["scanStatus"],
    expiresAt: normalizeTimestamp(row.expires_at ?? row.expiresAt) ?? undefined,
    deletedAt: normalizeTimestamp(row.deleted_at ?? row.deletedAt) ?? undefined,
    createdAt: requireTimestamp(row.created_at ?? row.createdAt),
    finalizedAt: normalizeTimestamp(row.finalized_at ?? row.finalizedAt) ?? undefined,
    supersedesStorageObjectId: (row.supersedes_storage_object_id ?? row.supersedesStorageObjectId) as string | undefined,
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
    availableAt: requireTimestamp(row.available_at ?? row.availableAt),
    attemptCount: Number(row.attempt_count ?? row.attemptCount ?? 0),
    lastError: (row.last_error ?? row.lastError) as string | undefined,
    createdAt: requireTimestamp(row.created_at ?? row.createdAt),
    processedAt: normalizeTimestamp(row.processed_at ?? row.processedAt) ?? undefined,
  };
}

function mapOutboundMessage(row: Record<string, unknown>): OutboundMessageRecord {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id ?? row.organisationId),
    caseId: (row.case_id ?? row.caseId) as string | undefined,
    requestId: (row.request_id ?? row.requestId) as string | undefined,
    supplierActorId: (row.supplier_actor_id ?? row.supplierActorId) as string | undefined,
    portalGrantId: (row.portal_grant_id ?? row.portalGrantId) as string | undefined,
    outboxEventId: String(row.outbox_event_id ?? row.outboxEventId),
    semanticKey: String(row.semantic_key ?? row.semanticKey),
    recipient: String(row.recipient),
    fromAddress: String(row.from_address ?? row.fromAddress),
    templateId: String(row.template_id ?? row.templateId) as OutboundMessageRecord["templateId"],
    templateVersion: String(row.template_version ?? row.templateVersion),
    category: String(row.category),
    provider: String(row.provider) as OutboundMessageRecord["provider"],
    providerMessageId: (row.provider_message_id ?? row.providerMessageId) as string | undefined,
    transportStatus: String(row.transport_status ?? row.transportStatus) as TransportStatus,
    tokenFingerprint: (row.token_fingerprint ?? row.tokenFingerprint) as string | undefined,
    createdAt: requireTimestamp(row.created_at ?? row.createdAt),
    providerAcceptedAt: normalizeTimestamp(row.provider_accepted_at ?? row.providerAcceptedAt) ?? undefined,
    deliveredAt: normalizeTimestamp(row.delivered_at ?? row.deliveredAt) ?? undefined,
    bouncedAt: normalizeTimestamp(row.bounced_at ?? row.bouncedAt) ?? undefined,
    complainedAt: normalizeTimestamp(row.complained_at ?? row.complainedAt) ?? undefined,
    lastProviderEventAt: normalizeTimestamp(row.last_provider_event_at ?? row.lastProviderEventAt) ?? undefined,
    lastError: (row.last_error ?? row.lastError) as string | undefined,
  };
}

function mapProviderEvent(row: Record<string, unknown>): EmailProviderEventRecord {
  return {
    id: String(row.id),
    organisationId: (row.organisation_id ?? row.organisationId) as string | undefined,
    outboundMessageId: (row.outbound_message_id ?? row.outboundMessageId) as string | undefined,
    provider: String(row.provider) as EmailProviderEventRecord["provider"],
    providerEventId: String(row.provider_event_id ?? row.providerEventId),
    providerMessageId: (row.provider_message_id ?? row.providerMessageId) as string | undefined,
    eventType: String(row.event_type ?? row.eventType),
    occurredAt: requireTimestamp(row.occurred_at ?? row.occurredAt),
    processedAt: requireTimestamp(row.processed_at ?? row.processedAt),
  };
}
