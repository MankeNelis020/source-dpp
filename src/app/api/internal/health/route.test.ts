import { beforeEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "@/server/source/types";

const CRON = "production-cron-secret-value";
const DSN = "postgres://source_app:super-secret-password@db.vezhdbzizniurehclxpg.supabase.co:6543/postgres";
const PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

const bootSourceRuntime = vi.fn();
const getSourceEnvironment = vi.fn();
const getPersistenceHealth = vi.fn();
const getPersistence = vi.fn();
const requireCronSecret = vi.fn();

vi.mock("@/infrastructure/runtime", () => ({
  bootSourceRuntime: () => bootSourceRuntime(),
  getSourceEnvironment: () => getSourceEnvironment(),
  getPersistenceHealth: () => getPersistenceHealth(),
  getPersistence: () => getPersistence(),
}));

vi.mock("@/server/source/cron-auth", () => ({
  requireCronSecret: (request: Request) => requireCronSecret(request),
}));

vi.mock("@/infrastructure/email/factory", () => ({
  emailConfigurationStatus: vi.fn(() => "configured"),
}));

import { GET } from "@/app/api/internal/health/route";

const HEALTHY_ENV = {
  persistence: "postgres" as const,
  runtime: "production" as const,
  cronSecret: CRON,
};

function healthRequest(authorized = true) {
  return new Request("http://localhost/api/internal/health", {
    headers: authorized ? { authorization: `Bearer ${CRON}` } : {},
  });
}

function expectNoSecrets(blob: string) {
  expect(blob).not.toContain(CRON);
  expect(blob).not.toContain("super-secret-password");
  expect(blob).not.toContain(DSN);
  expect(blob).not.toContain("BEGIN CERTIFICATE");
  expect(blob).not.toContain(PEM);
  expect(blob).not.toContain("vezhdbzizniurehclxpg");
}

describe("GET /api/internal/health", () => {
  beforeEach(() => {
    bootSourceRuntime.mockReset();
    getSourceEnvironment.mockReset();
    getPersistenceHealth.mockReset();
    getPersistence.mockReset();
    requireCronSecret.mockReset();
    getSourceEnvironment.mockReturnValue(HEALTHY_ENV);
    getPersistence.mockReturnValue({
      countOutbox: vi.fn(async (status: string) => (status === "PENDING" ? 2 : status === "FAILED" ? 1 : 4)),
    });
  });

  it("rejects unauthenticated requests before booting runtime", async () => {
    requireCronSecret.mockImplementation(() => {
      throw new SourceError("UNAUTHENTICATED", "Worker is not configured.", 401);
    });
    const response = await GET(healthRequest(false));
    expect(response.status).toBe(401);
    expect(bootSourceRuntime).not.toHaveBeenCalled();
    expect(getPersistenceHealth).not.toHaveBeenCalled();
    expect(getPersistence).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.error).toBe("UNAUTHENTICATED");
    expectNoSecrets(JSON.stringify(body));
  });

  it("boots runtime before reading health so a cold isolate does not return stale error state", async () => {
    const order: string[] = [];
    getPersistenceHealth.mockImplementation(() => {
      order.push("health");
      return { database: "error", persistence: "postgres", storage: "error" };
    });
    bootSourceRuntime.mockImplementation(async () => {
      order.push("boot");
      getPersistenceHealth.mockImplementation(() => {
        order.push("health");
        return { database: "ok", persistence: "postgres", storage: "ok" };
      });
    });

    const response = await GET(healthRequest());
    expect(requireCronSecret).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(order).toEqual(["boot", "health"]);
    const body = await response.json();
    expect(body).toEqual({
      database: "ok",
      persistence: "postgres",
      storage: "ok",
      email: "configured",
      outboxBacklog: 3,
      outboxDeadLetter: 4,
    });
    expectNoSecrets(JSON.stringify(body));
  });

  it("returns 503 without outbox counts when boot succeeds but database health is not ok", async () => {
    bootSourceRuntime.mockResolvedValue({});
    getPersistenceHealth.mockReturnValue({ database: "error", persistence: "postgres", storage: "error" });
    const response = await GET(healthRequest());
    expect(response.status).toBe(503);
    expect(getPersistence).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body).toEqual({
      database: "error",
      persistence: "postgres",
      storage: "error",
      email: "configured",
    });
    expect(body.outboxBacklog).toBeUndefined();
    expectNoSecrets(JSON.stringify(body));
  });

  it("fails closed with a generic 503 when runtime boot fails and does not echo secrets", async () => {
    bootSourceRuntime.mockRejectedValue(
      new Error(`SOURCE persistence health check failed ${DSN} ${PEM} cron=${CRON}`)
    );
    const response = await GET(healthRequest());
    expect(response.status).toBe(503);
    expect(getPersistence).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body).toEqual({
      database: "error",
      persistence: "postgres",
      storage: "error",
      email: "unconfigured",
    });
    expectNoSecrets(JSON.stringify(body));
  });
});
