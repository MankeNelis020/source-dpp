/**
 * Fail-closed SOURCE runtime configuration.
 *
 * Project selection is derived only from trusted server/process environment
 * (SOURCE_ENV, Vercel VERCEL_ENV). Never from the browser, query parameters,
 * cookies, tenant records, or client-supplied config.
 *
 * Server-only fields in this module must not be imported from Client Components.
 */

export const DEV_PREVIEW_SUPABASE_URL = "https://hhuurdzzsinzwbkkokzz.supabase.co";
export const PRODUCTION_SUPABASE_URL = "https://vezhdbzizniurehclxpg.supabase.co";

export const DEV_PREVIEW_PROJECT_REF = "hhuurdzzsinzwbkkokzz";
export const PRODUCTION_PROJECT_REF = "vezhdbzizniurehclxpg";

export type RuntimeEnvironment = "local" | "preview" | "production";
export type PersistenceAdapterKind = "memory" | "postgres";
export type IdentityProviderKind = "supabase" | "test";
export type ObjectStorageKind = "memory" | "supabase";
export type EmailProviderKind = "test" | "resend";
export type EmailMode = "test" | "live";

export const DEFAULT_IMPORT_BUCKET = "source-imports";
export const DEFAULT_EVIDENCE_BUCKET = "source-evidence";
export const DEFAULT_SIGNED_READ_TTL_SECONDS = 300;
export const DEFAULT_TEMP_UPLOAD_TTL_HOURS = 24;

export class SourceEnvironmentError extends Error {
  readonly code = "SOURCE_ENVIRONMENT_MISMATCH";

  constructor(message: string) {
    super(message);
    this.name = "SourceEnvironmentError";
  }
}

export interface SourceEnvironment {
  runtime: RuntimeEnvironment;
  persistence: PersistenceAdapterKind;
  identityProvider: IdentityProviderKind;
  objectStorage: ObjectStorageKind;
  supabaseUrl?: string;
  appDatabaseUrl?: string;
  migratorDatabaseUrl?: string;
  supabaseAnonKey?: string;
  /**
   * Server-only. Isolated in SupabaseObjectStorage.
   * Never expose to client bundles. Never used to authorize user behavior.
   * Service role bypasses Storage RLS — SOURCE policy decides first.
   */
  supabaseServiceRoleKey?: string;
  /**
   * Server-only PEM CA for hosted Postgres TLS (pg Pool `ssl.ca`).
   * Never NEXT_PUBLIC_. Never log or include in health/error payloads.
   * Required for preview/production Postgres runtime.
   */
  supabaseDbCaCert?: string;
  appPublicUrl?: string;
  invitationTtlDays: number;
  importBucket: string;
  evidenceBucket: string;
  signedReadTtlSeconds: number;
  tempUploadTtlHours: number;
  emailProvider?: EmailProviderKind;
  emailMode?: EmailMode;
  resendApiKey?: string;
  emailFrom?: string;
  emailReplyTo?: string;
  resendWebhookSecret?: string;
  emailAllowedRecipients?: string[];
  inboundWebhookSecret?: string;
  inboundReplyDomain?: string;
  outboxBatchSize?: number;
  outboxMaxAttempts?: number;
  cronSecret?: string;
}

export type EnvMap = Record<string, string | undefined>;

const SUPPORTED_RUNTIMES = new Set<RuntimeEnvironment>(["local", "preview", "production"]);

export function isNextBuildPhase(env: EnvMap = process.env): boolean {
  return env.NEXT_PHASE === "phase-production-build" || env.NEXT_PHASE === "phase-export";
}

export function loadSourceEnvironment(
  env: EnvMap = process.env,
  options: { mode?: "runtime" | "migrator" } = {}
): SourceEnvironment {
  const mode = options.mode ?? "runtime";
  const runtime = resolveRuntime(env);
  const supabaseUrl = trim(env.NEXT_PUBLIC_SUPABASE_URL);
  const appDatabaseUrl = trim(env.SOURCE_APP_DATABASE_URL);
  const migratorDatabaseUrl = trim(env.SOURCE_MIGRATOR_DATABASE_URL) ?? (mode === "migrator" ? trim(env.DATABASE_URL) : undefined);
  const supabaseAnonKey = trim(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const supabaseServiceRoleKey = trim(env.SUPABASE_SERVICE_ROLE_KEY);
  const appPublicUrl = trim(env.NEXT_PUBLIC_SOURCE_APP_URL);
  const invitationTtlDays = Number(env.SOURCE_INVITATION_TTL_DAYS ?? 7);
  const identityProvider = resolveIdentityProvider(runtime, env, supabaseUrl, supabaseAnonKey);
  const persistence = mode === "migrator" ? "postgres" : resolvePersistenceAdapter(runtime, env);
  const objectStorage = resolveObjectStorageAdapter(runtime, env);
  const importBucket = trim(env.SOURCE_IMPORT_BUCKET) ?? DEFAULT_IMPORT_BUCKET;
  const evidenceBucket = trim(env.SOURCE_EVIDENCE_BUCKET) ?? DEFAULT_EVIDENCE_BUCKET;
  const signedReadTtlSeconds = positiveInt(env.SOURCE_SIGNED_READ_TTL_SECONDS, DEFAULT_SIGNED_READ_TTL_SECONDS);
  const tempUploadTtlHours = positiveInt(env.SOURCE_TEMP_UPLOAD_TTL_HOURS, DEFAULT_TEMP_UPLOAD_TTL_HOURS);
  const emailFrom = trim(env.SOURCE_EMAIL_FROM);
  const emailReplyTo = trim(env.SOURCE_EMAIL_REPLY_TO);
  const resendApiKey = trim(env.RESEND_API_KEY);
  const resendWebhookSecret = trim(env.RESEND_WEBHOOK_SECRET);
  const inboundWebhookSecret = trim(env.SOURCE_INBOUND_WEBHOOK_SECRET);
  const inboundReplyDomain = trim(env.SOURCE_INBOUND_REPLY_DOMAIN)?.replace(/^@/, "");
  const cronSecret = trim(env.CRON_SECRET);
  const emailAllowedRecipients = parseEmailList(env.SOURCE_EMAIL_ALLOWED_RECIPIENTS);
  const outboxBatchSize = positiveInt(env.SOURCE_OUTBOX_BATCH_SIZE, 20);
  const outboxMaxAttempts = positiveInt(env.SOURCE_OUTBOX_MAX_ATTEMPTS, 5);
  const emailMode = resolveEmailMode(runtime, env);
  const emailProvider = resolveEmailProvider(runtime, env, emailMode);
  const supabaseDbCaCert = decodePemEnv(env.SUPABASE_DB_CA_CERT);

  assertProjectIsolation({
    runtime,
    supabaseUrl,
    appDatabaseUrl: mode === "runtime" ? appDatabaseUrl : undefined,
    migratorDatabaseUrl,
  });
  assertForbiddenOperationalFlags(runtime, env);

  if (mode === "migrator") {
    if (!migratorDatabaseUrl) {
      throw new SourceEnvironmentError(
        "SOURCE_MIGRATOR_DATABASE_URL is required to apply migrations. Do not use SOURCE_APP_DATABASE_URL for DDL."
      );
    }
    if (runtime === "preview" || runtime === "production") {
      if (!trim(env.SOURCE_MIGRATOR_DATABASE_URL)) {
        throw new SourceEnvironmentError(
          "SOURCE_MIGRATOR_DATABASE_URL is required to apply migrations. Do not use SOURCE_APP_DATABASE_URL for DDL."
        );
      }
    }
    assertMigratorRole(migratorDatabaseUrl);
    if (runtime === "preview" || runtime === "production") {
      if (!supabaseUrl) {
        throw new SourceEnvironmentError(
          "SOURCE environment configuration mismatch: NEXT_PUBLIC_SUPABASE_URL is required."
        );
      }
      assertHostedPostgresTls(supabaseDbCaCert);
    }
    return {
      runtime,
      persistence: "postgres",
      identityProvider,
      objectStorage,
      supabaseUrl,
      appDatabaseUrl,
      migratorDatabaseUrl,
      supabaseAnonKey,
      supabaseServiceRoleKey,
      supabaseDbCaCert,
      appPublicUrl,
      invitationTtlDays: Number.isFinite(invitationTtlDays) && invitationTtlDays > 0 ? invitationTtlDays : 7,
      importBucket,
      evidenceBucket,
      signedReadTtlSeconds,
      tempUploadTtlHours,
      emailProvider,
      emailMode,
      resendApiKey,
      emailFrom,
      emailReplyTo,
      resendWebhookSecret,
      emailAllowedRecipients,
      outboxBatchSize,
      outboxMaxAttempts,
      cronSecret,
    };
  }

  if (runtime === "preview" || runtime === "production") {
    if (!supabaseUrl) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: NEXT_PUBLIC_SUPABASE_URL is required."
      );
    }
    if (!supabaseAnonKey) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: NEXT_PUBLIC_SUPABASE_ANON_KEY is required."
      );
    }
    if (!appDatabaseUrl) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: SOURCE_APP_DATABASE_URL is required."
      );
    }
    if (!trim(env.SOURCE_SESSION_SECRET)) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: SOURCE_SESSION_SECRET is required."
      );
    }
    if (!trim(env.SOURCE_OPAQUE_REF_SECRET)) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: SOURCE_OPAQUE_REF_SECRET is required."
      );
    }
    if (identityProvider !== "supabase") {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: preview and production cannot use the test identity provider."
      );
    }
    if (objectStorage !== "supabase") {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: memory object storage is not allowed in preview or production."
      );
    }
    if (!supabaseServiceRoleKey) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: SUPABASE_SERVICE_ROLE_KEY is required for object storage."
      );
    }
    if (!appPublicUrl) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: NEXT_PUBLIC_SOURCE_APP_URL is required."
      );
    }
    assertProductionPublicUrl(runtime, appPublicUrl);
    if (!cronSecret) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: CRON_SECRET is required."
      );
    }
    assertEmailPolicy({ runtime, emailMode, emailProvider, resendApiKey, emailFrom, resendWebhookSecret, emailAllowedRecipients });
    assertAppRole(appDatabaseUrl);
    assertHostedPostgresTls(supabaseDbCaCert);
  }

  if (objectStorage === "supabase") {
    if (!supabaseUrl) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: NEXT_PUBLIC_SUPABASE_URL is required for object storage."
      );
    }
    if (!supabaseServiceRoleKey) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: SUPABASE_SERVICE_ROLE_KEY is required for object storage."
      );
    }
  }

  if (persistence === "postgres") {
    if (!appDatabaseUrl) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: SOURCE_APP_DATABASE_URL is required for Postgres persistence."
      );
    }
    assertAppRole(appDatabaseUrl);
  }

  if (migratorDatabaseUrl) {
    assertMigratorRole(migratorDatabaseUrl);
  }

  return {
    runtime,
    persistence,
    identityProvider,
    objectStorage,
    supabaseUrl,
    appDatabaseUrl,
    migratorDatabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    supabaseDbCaCert,
    appPublicUrl,
    invitationTtlDays: Number.isFinite(invitationTtlDays) && invitationTtlDays > 0 ? invitationTtlDays : 7,
    importBucket,
    evidenceBucket,
    signedReadTtlSeconds,
    tempUploadTtlHours,
    emailProvider,
    emailMode,
    resendApiKey,
    emailFrom,
    emailReplyTo,
    resendWebhookSecret,
    inboundWebhookSecret,
    inboundReplyDomain,
    emailAllowedRecipients,
    outboxBatchSize,
    outboxMaxAttempts,
    cronSecret,
  };
}

export function resolveRuntime(env: EnvMap = process.env): RuntimeEnvironment {
  const explicit = trim(env.SOURCE_ENV)?.toLowerCase();
  if (explicit) {
    if (!SUPPORTED_RUNTIMES.has(explicit as RuntimeEnvironment)) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: SOURCE_ENV is not a supported runtime."
      );
    }
    const platform = platformRuntime(env.VERCEL_ENV);
    const selected = explicit as RuntimeEnvironment;
    if (platform && platform !== selected) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: SOURCE_ENV does not match the deployment environment."
      );
    }
    return selected;
  }
  return platformRuntime(env.VERCEL_ENV) ?? "local";
}

export function containsProjectRef(value: string | undefined, ref: string): boolean {
  if (!value) return false;
  return value.toLowerCase().includes(ref.toLowerCase());
}

export function postgresUrlUser(url: string): string | undefined {
  try {
    const username = new URL(url).username;
    return username ? decodeURIComponent(username) : undefined;
  } catch {
    const match = url.match(/^postgres(?:ql)?:\/\/([^:/?#]+)@/i);
    if (!match) return undefined;
    const userinfo = match[1];
    const user = userinfo.split(":")[0];
    try {
      return decodeURIComponent(user);
    } catch {
      return user;
    }
  }
}

export function roleName(user: string | undefined): string | undefined {
  if (!user) return undefined;
  return user.split(".")[0]?.toLowerCase();
}

function resolveIdentityProvider(
  runtime: RuntimeEnvironment,
  env: EnvMap,
  supabaseUrl: string | undefined,
  supabaseAnonKey: string | undefined
): IdentityProviderKind {
  const requested = trim(env.SOURCE_IDENTITY_PROVIDER)?.toLowerCase();
  if (requested && requested !== "supabase" && requested !== "test") {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: SOURCE_IDENTITY_PROVIDER must be supabase or test."
    );
  }
  if (runtime === "preview" || runtime === "production") {
    if (requested === "test") {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: preview and production cannot use the test identity provider."
      );
    }
    return "supabase";
  }
  if (requested === "test") return "test";
  if (requested === "supabase") return "supabase";
  if (supabaseUrl && supabaseAnonKey) return "supabase";
  return "test";
}

function resolveObjectStorageAdapter(runtime: RuntimeEnvironment, env: EnvMap): ObjectStorageKind {
  const requested = trim(env.SOURCE_OBJECT_STORAGE)?.toLowerCase();
  if (requested && requested !== "memory" && requested !== "supabase") {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: SOURCE_OBJECT_STORAGE must be memory or supabase."
    );
  }
  if (runtime === "preview" || runtime === "production") {
    if (requested === "memory") {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: memory object storage is not allowed in preview or production."
      );
    }
    return "supabase";
  }
  if (requested === "supabase") return "supabase";
  return "memory";
}

function resolveEmailMode(runtime: RuntimeEnvironment, env: EnvMap): EmailMode {
  const requested = trim(env.SOURCE_EMAIL_MODE)?.toLowerCase();
  if (requested && requested !== "test" && requested !== "live") {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: SOURCE_EMAIL_MODE must be test or live."
    );
  }
  if (runtime === "production") {
    if (requested === "test") {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: production cannot use SOURCE_EMAIL_MODE=test."
      );
    }
    return "live";
  }
  if (requested === "live") return "live";
  return "test";
}

function resolveEmailProvider(runtime: RuntimeEnvironment, env: EnvMap, mode: EmailMode): EmailProviderKind {
  const requested = trim(env.SOURCE_EMAIL_PROVIDER)?.toLowerCase();
  if (requested && requested !== "test" && requested !== "resend") {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: SOURCE_EMAIL_PROVIDER must be test or resend."
    );
  }
  if (runtime === "production") {
    if (requested === "test") {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: production cannot use the test email provider."
      );
    }
    return "resend";
  }
  if (requested === "resend") return "resend";
  if (runtime === "preview" && mode === "live") return "resend";
  return "test";
}

function assertEmailPolicy(input: {
  runtime: RuntimeEnvironment;
  emailMode: EmailMode;
  emailProvider: EmailProviderKind;
  resendApiKey?: string;
  emailFrom?: string;
  resendWebhookSecret?: string;
  emailAllowedRecipients: string[];
}) {
  if (input.runtime === "production") {
    if (input.emailProvider !== "resend" || input.emailMode !== "live") {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: production email must use live Resend."
      );
    }
    if (!input.resendApiKey || !input.emailFrom || !input.resendWebhookSecret) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: RESEND_API_KEY, SOURCE_EMAIL_FROM, and RESEND_WEBHOOK_SECRET are required."
      );
    }
  }
  if (input.runtime === "preview" && input.emailMode === "live") {
    if (!input.resendApiKey || !input.emailFrom || !input.resendWebhookSecret) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: preview live email requires Resend configuration."
      );
    }
    if (!input.emailAllowedRecipients.length) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: preview live email requires SOURCE_EMAIL_ALLOWED_RECIPIENTS."
      );
    }
  }
}

function parseEmailList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.includes("@") && item.includes("."));
}

function resolvePersistenceAdapter(runtime: RuntimeEnvironment, env: EnvMap): PersistenceAdapterKind {
  const requested = trim(env.SOURCE_PERSISTENCE)?.toLowerCase();
  if (requested && requested !== "memory" && requested !== "postgres") {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: SOURCE_PERSISTENCE must be memory or postgres."
    );
  }
  if (runtime === "preview" || runtime === "production") {
    if (requested === "memory") {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: memory persistence is not allowed in preview or production."
      );
    }
    return "postgres";
  }
  if (requested === "postgres") return "postgres";
  return "memory";
}

function platformRuntime(vercelEnv: string | undefined): RuntimeEnvironment | undefined {
  const value = trim(vercelEnv)?.toLowerCase();
  if (value === "production") return "production";
  if (value === "preview") return "preview";
  if (value === "development") return "local";
  return undefined;
}

function assertProductionPublicUrl(runtime: RuntimeEnvironment, appPublicUrl: string) {
  if (runtime !== "production") return;
  let parsed: URL;
  try {
    parsed = new URL(appPublicUrl);
  } catch {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: NEXT_PUBLIC_SOURCE_APP_URL must be a valid https origin."
    );
  }
  if (parsed.protocol !== "https:") {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: production NEXT_PUBLIC_SOURCE_APP_URL must use https."
    );
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "vercel.app" || host.endsWith(".vercel.app")) {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: production NEXT_PUBLIC_SOURCE_APP_URL cannot be a Vercel Preview URL."
    );
  }
}

function assertForbiddenOperationalFlags(runtime: RuntimeEnvironment, env: EnvMap) {
  if (runtime !== "preview" && runtime !== "production") return;
  if (trim(env.SOURCE_DEMO_AUTH) === "1") {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: SOURCE_DEMO_AUTH is not allowed in preview or production."
    );
  }
  if (trim(env.SOURCE_EXPOSE_INVITE_LINKS) === "1") {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: SOURCE_EXPOSE_INVITE_LINKS is not allowed in preview or production."
    );
  }
}

function assertProjectIsolation(input: {
  runtime: RuntimeEnvironment;
  supabaseUrl?: string;
  appDatabaseUrl?: string;
  migratorDatabaseUrl?: string;
}) {
  const blobs = [input.supabaseUrl, input.appDatabaseUrl, input.migratorDatabaseUrl];
  const usesDev = blobs.some((value) => containsProjectRef(value, DEV_PREVIEW_PROJECT_REF));
  const usesProd = blobs.some((value) => containsProjectRef(value, PRODUCTION_PROJECT_REF));

  if (input.runtime === "production" && usesDev) {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: production cannot use the development Supabase project."
    );
  }
  if (input.runtime === "preview" && usesProd) {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: preview cannot use the production Supabase project."
    );
  }
  if (input.runtime === "local" && usesProd) {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: local cannot use the production Supabase project."
    );
  }

  if (input.supabaseUrl) {
    if (input.runtime === "production" && input.supabaseUrl !== PRODUCTION_SUPABASE_URL) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: production cannot use the development Supabase project."
      );
    }
    if (input.runtime === "preview" && input.supabaseUrl !== DEV_PREVIEW_SUPABASE_URL) {
      throw new SourceEnvironmentError(
        "SOURCE environment configuration mismatch: preview cannot use the production Supabase project."
      );
    }
  }

  if (usesDev && usesProd) {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: development and production Supabase projects cannot be mixed."
    );
  }
}

function assertAppRole(url: string) {
  const role = roleName(postgresUrlUser(url));
  if (role && role !== "source_app") {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: SOURCE_APP_DATABASE_URL must use the source_app role."
    );
  }
}

function assertMigratorRole(url: string) {
  const role = roleName(postgresUrlUser(url));
  if (role === "source_app") {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: SOURCE_MIGRATOR_DATABASE_URL must not use the runtime source_app role."
    );
  }
}

function assertHostedPostgresTls(ca: string | undefined) {
  if (!ca) {
    throw new SourceEnvironmentError(
      "SOURCE environment configuration mismatch: SUPABASE_DB_CA_CERT is required for hosted Postgres TLS."
    );
  }
}

/**
 * PEM from Vercel/env may use literal `\n` sequences. Never log the result.
 */
function decodePemEnv(value: string | undefined): string | undefined {
  const next = trim(value);
  if (!next) return undefined;
  return next.replace(/\\n/g, "\n");
}

function trim(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}
