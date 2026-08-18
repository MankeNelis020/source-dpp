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
  supabaseUrl?: string;
  appDatabaseUrl?: string;
  migratorDatabaseUrl?: string;
  supabaseAnonKey?: string;
  /** Server-only. Never expose to client bundles. Never used for domain I/O. */
  supabaseServiceRoleKey?: string;
  appPublicUrl?: string;
  invitationTtlDays: number;
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

  assertProjectIsolation({
    runtime,
    supabaseUrl,
    appDatabaseUrl: mode === "runtime" ? appDatabaseUrl : undefined,
    migratorDatabaseUrl,
  });

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
    }
    return {
      runtime,
      persistence: "postgres",
      identityProvider,
      supabaseUrl,
      appDatabaseUrl,
      migratorDatabaseUrl,
      supabaseAnonKey,
      supabaseServiceRoleKey,
      appPublicUrl,
      invitationTtlDays: Number.isFinite(invitationTtlDays) && invitationTtlDays > 0 ? invitationTtlDays : 7,
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
    assertAppRole(appDatabaseUrl);
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
    supabaseUrl,
    appDatabaseUrl,
    migratorDatabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    appPublicUrl,
    invitationTtlDays: Number.isFinite(invitationTtlDays) && invitationTtlDays > 0 ? invitationTtlDays : 7,
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

function trim(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}
