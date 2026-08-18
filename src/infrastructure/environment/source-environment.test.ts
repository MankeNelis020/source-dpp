import { describe, expect, it } from "vitest";
import {
  DEV_PREVIEW_SUPABASE_URL,
  PRODUCTION_SUPABASE_URL,
  SourceEnvironmentError,
  loadSourceEnvironment,
} from "@/infrastructure/environment/source-environment";
import { createRuntimePersistence as createPersistence } from "@/infrastructure/database/runtime-persistence";
import { MemoryPersistence } from "@/infrastructure/database/memory";

const SECRETS = {
  SOURCE_SESSION_SECRET: "test-session-secret",
  SOURCE_OPAQUE_REF_SECRET: "test-opaque-secret",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key-not-a-secret",
};

const DEV_APP_URL = "postgres://source_app:not-a-real-secret@localhost:5432/postgres";
const PROD_APP_URL = "postgres://source_app:not-a-real-secret@localhost:5432/postgres";
const DEV_DSN_WITH_REF = "postgres://source_app:super-secret-password@db.hhuurdzzsinzwbkkokzz.supabase.co:6543/postgres";
const PROD_DSN_WITH_REF = "postgres://source_app:super-secret-password@db.vezhdbzizniurehclxpg.supabase.co:6543/postgres";

function expectConfigError(fn: () => unknown, pattern: RegExp) {
  try {
    fn();
    throw new Error("expected SourceEnvironmentError");
  } catch (error) {
    expect(error).toBeInstanceOf(SourceEnvironmentError);
    const message = error instanceof Error ? error.message : "";
    expect(message).toMatch(pattern);
    expect(message).not.toContain("super-secret-password");
    expect(message).not.toMatch(/postgres(?:ql)?:\/\//i);
  }
}

describe("SOURCE environment isolation", () => {
  it("fails closed when preview points at the production Supabase project", () => {
    expectConfigError(
      () =>
        loadSourceEnvironment({
          SOURCE_ENV: "preview",
          NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
          SOURCE_APP_DATABASE_URL: PROD_APP_URL,
          ...SECRETS,
        }),
      /preview cannot use the production Supabase project/
    );
  });

  it("fails closed when production points at the development Supabase project", () => {
    expectConfigError(
      () =>
        loadSourceEnvironment({
          SOURCE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL: DEV_PREVIEW_SUPABASE_URL,
          SOURCE_APP_DATABASE_URL: DEV_APP_URL,
          ...SECRETS,
        }),
      /production cannot use the development Supabase project/
    );
  });

  it("fails closed when production DSN contains the development project ref", () => {
    expectConfigError(
      () =>
        loadSourceEnvironment({
          SOURCE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
          SOURCE_APP_DATABASE_URL: DEV_DSN_WITH_REF,
          ...SECRETS,
        }),
      /production cannot use the development Supabase project/
    );
  });

  it("fails closed when preview DSN contains the production project ref", () => {
    expectConfigError(
      () =>
        loadSourceEnvironment({
          SOURCE_ENV: "preview",
          NEXT_PUBLIC_SUPABASE_URL: DEV_PREVIEW_SUPABASE_URL,
          SOURCE_APP_DATABASE_URL: PROD_DSN_WITH_REF,
          ...SECRETS,
        }),
      /preview cannot use the production Supabase project/
    );
  });

  it("fails closed when production is missing SOURCE_APP_DATABASE_URL and does not create MemoryPersistence", () => {
    expectConfigError(
      () =>
        loadSourceEnvironment({
          SOURCE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
          ...SECRETS,
        }),
      /SOURCE_APP_DATABASE_URL is required/
    );
    expect(() =>
      createPersistence({
        runtime: "production",
        persistence: "postgres",
        identityProvider: "supabase",
        invitationTtlDays: 7,
      })
    ).toThrow(SourceEnvironmentError);
    expect(() =>
      createPersistence({
        runtime: "production",
        persistence: "memory",
        identityProvider: "supabase",
        invitationTtlDays: 7,
      })
    ).toThrow(/memory persistence is not allowed/);
  });

  it("rejects SOURCE_PERSISTENCE=memory in preview and production", () => {
    expectConfigError(
      () =>
        loadSourceEnvironment({
          SOURCE_ENV: "preview",
          NEXT_PUBLIC_SUPABASE_URL: DEV_PREVIEW_SUPABASE_URL,
          SOURCE_APP_DATABASE_URL: DEV_APP_URL,
          SOURCE_PERSISTENCE: "memory",
          ...SECRETS,
        }),
      /memory persistence is not allowed/
    );
  });

  it("allows explicit local memory persistence", () => {
    const env = loadSourceEnvironment({
      SOURCE_ENV: "local",
      SOURCE_PERSISTENCE: "memory",
    });
    expect(env.runtime).toBe("local");
    expect(env.persistence).toBe("memory");
    const created = createPersistence(env);
    expect(created.kind).toBe("memory");
    expect(created.store).toBeInstanceOf(MemoryPersistence);
  });

  it("derives preview and production from VERCEL_ENV when SOURCE_ENV is unset", () => {
    expect(
      loadSourceEnvironment({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SUPABASE_URL: DEV_PREVIEW_SUPABASE_URL,
        SOURCE_APP_DATABASE_URL: DEV_APP_URL,
        ...SECRETS,
      }).runtime
    ).toBe("preview");
    expect(
      loadSourceEnvironment({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
        SOURCE_APP_DATABASE_URL: PROD_APP_URL,
        ...SECRETS,
      }).runtime
    ).toBe("production");
  });

  it("refuses to mix SOURCE_ENV with a conflicting Vercel deployment environment", () => {
    expectConfigError(
      () =>
        loadSourceEnvironment({
          SOURCE_ENV: "production",
          VERCEL_ENV: "preview",
          NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
          SOURCE_APP_DATABASE_URL: PROD_APP_URL,
          ...SECRETS,
        }),
      /SOURCE_ENV does not match the deployment environment/
    );
  });

  it("does not treat NODE_ENV=production as a Supabase production signal", () => {
    const env = loadSourceEnvironment({
      NODE_ENV: "production",
    });
    expect(env.runtime).toBe("local");
    expect(env.persistence).toBe("memory");
  });

  it("refuses migrator credentials that use source_app", () => {
    expectConfigError(
      () =>
        loadSourceEnvironment(
          {
            SOURCE_ENV: "local",
            SOURCE_MIGRATOR_DATABASE_URL: DEV_APP_URL,
          },
          { mode: "migrator" }
        ),
      /must not use the runtime source_app role/
    );
  });
});
