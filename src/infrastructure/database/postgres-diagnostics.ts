import { postgresUrlUser, resolveRuntime } from "@/infrastructure/environment/source-environment";

/**
 * Temporary/operational Postgres failure diagnostics for hosted connectivity.
 * Safe to retain: fields are allow-listed and secret-bearing values are redacted.
 * Never log passwords, full DSNs, CA PEMs, secret query params, or service-role keys.
 */

export type PostgresConnectionPhase = "connect" | "query" | "unknown";

export interface SafePostgresFailureDiagnostics {
  event: "postgres.health.failed";
  code?: string;
  message: string;
  phase: PostgresConnectionPhase;
  host?: string;
  port?: number;
  user?: string;
  sourceEnv?: string;
}

const DSN_RE = /postgres(?:ql)?:\/\/[^\s]+/gi;
const PEM_RE = /-----BEGIN [A-Z ]*CERTIFICATE-----[\s\S]*?-----END [A-Z ]*CERTIFICATE-----/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const SECRET_QUERY_RE = /[?&](ssl(?:root)?cert|sslkey|sslpassword|password|secret|api[_-]?key|service[_-]?role)=[^&\s]+/gi;

export function parsePostgresEndpoint(connectionString: string | undefined): {
  host?: string;
  port?: number;
  user?: string;
} {
  if (!connectionString) return {};
  try {
    const parsed = new URL(connectionString);
    const host = parsed.hostname || undefined;
    const port = parsed.port ? Number(parsed.port) : 5432;
    const user = postgresUrlUser(connectionString);
    return {
      host,
      port: Number.isFinite(port) ? port : undefined,
      user,
    };
  } catch {
    return { user: postgresUrlUser(connectionString) };
  }
}

export function postgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.length > 0 && code.length <= 64 ? code : undefined;
}

export function postgresErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "database unreachable";
}

export function secretsFromConnectionString(connectionString: string | undefined): string[] {
  if (!connectionString) return [];
  const secrets = new Set<string>();
  secrets.add(connectionString);
  try {
    const parsed = new URL(connectionString);
    if (parsed.password) {
      secrets.add(parsed.password);
      try {
        secrets.add(decodeURIComponent(parsed.password));
      } catch {
        /* ignore */
      }
    }
    for (const [key, value] of parsed.searchParams.entries()) {
      if (/pass|secret|token|key|cert|options/i.test(key) && value.length >= 8) {
        secrets.add(value);
      }
    }
  } catch {
    /* ignore malformed DSNs; the raw string is still redacted */
  }
  return [...secrets].filter((value) => value.length >= 8);
}

export function sanitizePostgresDiagnosticMessage(message: string, extraSecrets: string[] = []): string {
  DSN_RE.lastIndex = 0;
  PEM_RE.lastIndex = 0;
  JWT_RE.lastIndex = 0;
  SECRET_QUERY_RE.lastIndex = 0;
  let next = message;
  next = next.replace(PEM_RE, "[redacted-cert]");
  next = next.replace(DSN_RE, "postgres://[redacted]");
  next = next.replace(SECRET_QUERY_RE, "[redacted-param]");
  next = next.replace(JWT_RE, "[redacted-key]");
  for (const secret of extraSecrets) {
    if (!secret || secret.length < 8) continue;
    next = next.split(secret).join("[redacted]");
  }
  return next.replace(/\s+/g, " ").trim().slice(0, 300);
}

export function safePostgresFailureDiagnostics(input: {
  error: unknown;
  phase?: PostgresConnectionPhase;
  connectionString?: string;
  sourceEnv?: string;
}): SafePostgresFailureDiagnostics {
  const extraSecrets = secretsFromConnectionString(input.connectionString);
  const endpoint = parsePostgresEndpoint(input.connectionString);
  const diagnostics: SafePostgresFailureDiagnostics = {
    event: "postgres.health.failed",
    code: postgresErrorCode(input.error),
    message: sanitizePostgresDiagnosticMessage(postgresErrorMessage(input.error), extraSecrets),
    phase: input.phase ?? "unknown",
    host: endpoint.host,
    port: endpoint.port,
    user: endpoint.user,
    sourceEnv: input.sourceEnv ?? safeSourceEnv(),
  };
  return redactRemainingSecrets(diagnostics, extraSecrets);
}

export function logPostgresHealthFailure(diagnostics: SafePostgresFailureDiagnostics): void {
  console.error(JSON.stringify({ ...diagnostics, ts: new Date().toISOString() }));
}

function safeSourceEnv(): string | undefined {
  try {
    return resolveRuntime();
  } catch {
    return undefined;
  }
}

function redactRemainingSecrets(
  diagnostics: SafePostgresFailureDiagnostics,
  extraSecrets: string[]
): SafePostgresFailureDiagnostics {
  let blob = JSON.stringify(diagnostics);
  blob = blob.replace(PEM_RE, "[redacted-cert]");
  blob = blob.replace(/postgres(?:ql)?:\/\/(?!\[redacted\])[^\s"]+/gi, "postgres://[redacted]");
  for (const secret of extraSecrets) {
    if (!secret || secret.length < 8) continue;
    blob = blob.split(secret).join("[redacted]");
  }
  return JSON.parse(blob) as SafePostgresFailureDiagnostics;
}
