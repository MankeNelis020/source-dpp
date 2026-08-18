import { describe, expect, it } from "vitest";
import { createPostgresPool, postgresPoolConfig, postgresSslConfig } from "@/infrastructure/database/pool";

const LOCAL_CI_URL = "postgres://source:source@localhost:5432/source";
const SUPABASE_POOLER_URL =
  "postgres://source_app.notarealref:not-a-real-secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";
const DUMMY_DB_CA = "-----BEGIN CERTIFICATE-----\nTEST-NOT-A-REAL-CA\n-----END CERTIFICATE-----";

describe("Postgres pool TLS", () => {
  it("does not enable SSL for local/CI Postgres", () => {
    expect(postgresSslConfig(LOCAL_CI_URL)).toBeUndefined();
    const config = postgresPoolConfig(LOCAL_CI_URL, "app");
    expect(config.ssl).toBeUndefined();
  });

  it("configures hosted Pool TLS with rejectUnauthorized true and the provided CA", () => {
    const ssl = postgresSslConfig(SUPABASE_POOLER_URL, DUMMY_DB_CA);
    expect(ssl).toEqual({ rejectUnauthorized: true, ca: DUMMY_DB_CA });
    expect(ssl?.rejectUnauthorized).toBe(true);

    const config = postgresPoolConfig(SUPABASE_POOLER_URL, "app", { ca: DUMMY_DB_CA });
    expect(config.ssl).toEqual({ rejectUnauthorized: true, ca: DUMMY_DB_CA });
    if (typeof config.ssl === "boolean") {
      throw new Error("hosted TLS must not use a boolean ssl flag");
    }
    expect(config.ssl?.rejectUnauthorized).toBe(true);
    expect(config.ssl?.rejectUnauthorized).not.toBe(false);

    const pool = createPostgresPool(SUPABASE_POOLER_URL, "app", { ca: DUMMY_DB_CA });
    try {
      const poolSsl = pool.options.ssl;
      expect(poolSsl).toEqual({ rejectUnauthorized: true, ca: DUMMY_DB_CA });
      if (typeof poolSsl === "boolean") {
        throw new Error("hosted Pool TLS must not use a boolean ssl flag");
      }
      expect(poolSsl?.rejectUnauthorized).toBe(true);
      expect(poolSsl?.rejectUnauthorized).not.toBe(false);
    } finally {
      void pool.end();
    }
  });

  it("never disables TLS verification when SSL is required without a CA", () => {
    const ssl = postgresSslConfig(SUPABASE_POOLER_URL);
    expect(ssl).toEqual({ rejectUnauthorized: true });
    expect(ssl?.rejectUnauthorized).not.toBe(false);
  });
});
