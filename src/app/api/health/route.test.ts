import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/infrastructure/runtime", () => ({
  bootSourceRuntime: vi.fn(),
  getSourceEnvironment: vi.fn(),
  getPersistenceHealth: vi.fn(),
}));

vi.mock("@/infrastructure/email/factory", () => ({
  emailConfigurationStatus: vi.fn(() => "unconfigured"),
}));

import { GET } from "@/app/api/health/route";
import { bootSourceRuntime } from "@/infrastructure/runtime";

describe("public /api/health", () => {
  beforeEach(() => {
    vi.mocked(bootSourceRuntime).mockReset();
  });

  it("returns a generic 503 when boot fails and does not echo secrets", async () => {
    vi.mocked(bootSourceRuntime).mockRejectedValue(
      new Error(
        'password authentication failed for user "source_app" postgres://source_app:super-secret-password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres -----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----'
      )
    );
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({
      database: "error",
      persistence: "postgres",
      storage: "error",
      email: "unconfigured",
    });
    const blob = JSON.stringify(body);
    expect(blob).not.toContain("super-secret-password");
    expect(blob).not.toContain("BEGIN CERTIFICATE");
    expect(blob).not.toContain("pooler.supabase.com");
    expect(blob).not.toContain("28P01");
  });
});
