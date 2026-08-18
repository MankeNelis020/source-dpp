import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parsePostgresEndpoint,
  safePostgresFailureDiagnostics,
  sanitizePostgresDiagnosticMessage,
  secretsFromConnectionString,
} from "@/infrastructure/database/postgres-diagnostics";

const PASSWORD = "super-secret-password";
const DSN = `postgres://source_app.${"hhuurdzzsinzwbkkokzz"}:${PASSWORD}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require&sslrootcert=/tmp/prod-ca.crt`;
const CA_PEM = "-----BEGIN CERTIFICATE-----\nMIIB-TEST-CA\n-----END CERTIFICATE-----";
const SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature";

function expectNoSecrets(blob: string) {
  expect(blob).not.toContain(PASSWORD);
  expect(blob).not.toContain(DSN);
  expect(blob).not.toContain("sslrootcert=/tmp/prod-ca.crt");
  expect(blob).not.toContain("BEGIN CERTIFICATE");
  expect(blob).not.toContain("MIIB-TEST-CA");
  expect(blob).not.toContain(CA_PEM);
  expect(blob).not.toContain(SERVICE_ROLE);
  expect(blob).not.toMatch(/postgres(?:ql)?:\/\/source_app/i);
}

describe("safe Postgres failure diagnostics", () => {
  it("parses hostname, port, and username without the password", () => {
    expect(parsePostgresEndpoint(DSN)).toEqual({
      host: "aws-0-eu-central-1.pooler.supabase.com",
      port: 6543,
      user: "source_app.hhuurdzzsinzwbkkokzz",
    });
    expect(JSON.stringify(parsePostgresEndpoint(DSN))).not.toContain(PASSWORD);
  });

  it("defaults an omitted port to 5432 and never returns query params", () => {
    const endpoint = parsePostgresEndpoint(
      `postgres://source_app:${PASSWORD}@db.example.supabase.co/postgres?sslmode=require&password=${PASSWORD}`
    );
    expect(endpoint).toEqual({
      host: "db.example.supabase.co",
      port: 5432,
      user: "source_app",
    });
    expect(JSON.stringify(endpoint)).not.toContain(PASSWORD);
    expect(JSON.stringify(endpoint)).not.toContain("sslmode");
  });

  it("redacts DSN, password, CA PEM, query secrets, and service-role keys from messages", () => {
    const message = [
      `password authentication failed for user "source_app" ${DSN}`,
      CA_PEM,
      `sslrootcert=${CA_PEM}`,
      SERVICE_ROLE,
    ].join(" ");
    const sanitized = sanitizePostgresDiagnosticMessage(message, secretsFromConnectionString(DSN));
    expectNoSecrets(sanitized);
    expect(sanitized).toContain("password authentication failed for user");
  });

  it("emits allow-listed fields for a 28P01 connect failure without secrets", () => {
    const diagnostics = safePostgresFailureDiagnostics({
      error: Object.assign(new Error(`password authentication failed for user "source_app" ${DSN}`), {
        code: "28P01",
      }),
      phase: "connect",
      connectionString: DSN,
      sourceEnv: "preview",
    });
    expect(diagnostics).toMatchObject({
      event: "postgres.health.failed",
      code: "28P01",
      phase: "connect",
      host: "aws-0-eu-central-1.pooler.supabase.com",
      port: 6543,
      user: "source_app.hhuurdzzsinzwbkkokzz",
      sourceEnv: "preview",
    });
    expect(diagnostics.message).toMatch(/password authentication failed/i);
    expectNoSecrets(JSON.stringify(diagnostics));
  });

  it("keeps TLS verification failures diagnosable without the CA body", () => {
    const diagnostics = safePostgresFailureDiagnostics({
      error: Object.assign(new Error(`self-signed certificate in certificate chain ${CA_PEM}`), {
        code: "SELF_SIGNED_CERT_IN_CHAIN",
      }),
      phase: "connect",
      connectionString: DSN,
      sourceEnv: "preview",
    });
    expect(diagnostics.code).toBe("SELF_SIGNED_CERT_IN_CHAIN");
    expect(diagnostics.message).toMatch(/self-signed certificate in certificate chain/i);
    expectNoSecrets(JSON.stringify(diagnostics));
  });
});

describe("Postgres health check failure logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs connect-phase failures and still throws a generic unreachable error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { checkPostgresHealth } = await import("@/infrastructure/database/health");
    const pool = {
      options: { connectionString: DSN },
      connect: async () => {
        throw Object.assign(new Error(`password authentication failed for user "source_app" ${DSN}`), {
          code: "28P01",
        });
      },
    };

    await expect(
      checkPostgresHealth(pool as never, { connectionString: DSN, sourceEnv: "preview" })
    ).rejects.toThrow(/database unreachable/);

    expect(errorSpy).toHaveBeenCalled();
    const logged = String(errorSpy.mock.calls[0]?.[0]);
    const payload = JSON.parse(logged) as Record<string, unknown>;
    expect(payload.event).toBe("postgres.health.failed");
    expect(payload.code).toBe("28P01");
    expect(payload.phase).toBe("connect");
    expect(payload.host).toBe("aws-0-eu-central-1.pooler.supabase.com");
    expect(payload.port).toBe(6543);
    expect(payload.user).toBe("source_app.hhuurdzzsinzwbkkokzz");
    expect(payload.sourceEnv).toBe("preview");
    expectNoSecrets(logged);
    expectNoSecrets("SOURCE persistence health check failed: database unreachable.");
  });

  it("logs query-phase failures after a successful connect", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { checkPostgresHealth } = await import("@/infrastructure/database/health");
    const pool = {
      options: { connectionString: DSN },
      connect: async () => ({
        query: async () => {
          throw Object.assign(new Error(`timeout expired ${DSN}`), { code: "ETIMEDOUT" });
        },
        release: () => undefined,
      }),
    };

    await expect(
      checkPostgresHealth(pool as never, { connectionString: DSN, sourceEnv: "production" })
    ).rejects.toThrow(/database unreachable/);

    const logged = String(errorSpy.mock.calls[0]?.[0]);
    const payload = JSON.parse(logged) as Record<string, unknown>;
    expect(payload.code).toBe("ETIMEDOUT");
    expect(payload.phase).toBe("query");
    expect(payload.sourceEnv).toBe("production");
    expectNoSecrets(logged);
  });
});
