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
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-not-a-secret",
  NEXT_PUBLIC_SOURCE_APP_URL: "https://app.example.test",
  CRON_SECRET: "test-cron-secret-not-for-production",
};

const DUMMY_DB_CA = "-----BEGIN CERTIFICATE-----\nTEST-NOT-A-REAL-CA\n-----END CERTIFICATE-----";

const HOSTED = {
  ...SECRETS,
  SUPABASE_DB_CA_CERT: DUMMY_DB_CA,
};

const PRODUCTION_EMAIL = {
  RESEND_API_KEY: "re_test_not_a_real_key",
  SOURCE_EMAIL_FROM: "SOURCE <requests@mail.example.test>",
  RESEND_WEBHOOK_SECRET: "whsec_dGVzdHNlY3JldA==",
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
    expect(message).not.toContain("BEGIN CERTIFICATE");
    expect(message).not.toContain("TEST-NOT-A-REAL-CA");
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
        objectStorage: "supabase",
        invitationTtlDays: 7,
        importBucket: "source-imports",
        evidenceBucket: "source-evidence",
        signedReadTtlSeconds: 300,
        tempUploadTtlHours: 24,
      })
    ).toThrow(SourceEnvironmentError);
    expect(() =>
      createPersistence({
        runtime: "production",
        persistence: "memory",
        identityProvider: "supabase",
        objectStorage: "memory",
        invitationTtlDays: 7,
        importBucket: "source-imports",
        evidenceBucket: "source-evidence",
        signedReadTtlSeconds: 300,
        tempUploadTtlHours: 24,
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
        ...HOSTED,
      }).runtime
    ).toBe("preview");
    expect(
      loadSourceEnvironment({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
        SOURCE_APP_DATABASE_URL: PROD_APP_URL,
        ...HOSTED,
        ...PRODUCTION_EMAIL,
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

  it("fails closed when preview is missing SUPABASE_SERVICE_ROLE_KEY", () => {
    expectConfigError(
      () =>
        loadSourceEnvironment({
          SOURCE_ENV: "preview",
          NEXT_PUBLIC_SUPABASE_URL: DEV_PREVIEW_SUPABASE_URL,
          SOURCE_APP_DATABASE_URL: DEV_APP_URL,
          SOURCE_SESSION_SECRET: "test-session-secret",
          SOURCE_OPAQUE_REF_SECRET: "test-opaque-secret",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key-not-a-secret",
        }),
      /SUPABASE_SERVICE_ROLE_KEY is required/
    );
  });

  it("rejects SOURCE_OBJECT_STORAGE=memory in preview", () => {
    expectConfigError(
      () =>
        loadSourceEnvironment({
          SOURCE_ENV: "preview",
          NEXT_PUBLIC_SUPABASE_URL: DEV_PREVIEW_SUPABASE_URL,
          SOURCE_APP_DATABASE_URL: DEV_APP_URL,
          SOURCE_OBJECT_STORAGE: "memory",
          ...SECRETS,
        }),
      /memory object storage is not allowed/
    );
  });

  it("selects supabase object storage in preview when service role is present", () => {
    const env = loadSourceEnvironment({
      SOURCE_ENV: "preview",
      NEXT_PUBLIC_SUPABASE_URL: DEV_PREVIEW_SUPABASE_URL,
      SOURCE_APP_DATABASE_URL: DEV_APP_URL,
      ...HOSTED,
    });
    expect(env.objectStorage).toBe("supabase");
    expect(env.importBucket).toBe("source-imports");
  });

  it("defaults preview email to test mode and refuses live preview without an allow list", () => {
    const preview = loadSourceEnvironment({
      SOURCE_ENV: "preview",
      NEXT_PUBLIC_SUPABASE_URL: DEV_PREVIEW_SUPABASE_URL,
      SOURCE_APP_DATABASE_URL: DEV_APP_URL,
      ...HOSTED,
    });
    expect(preview.emailMode).toBe("test");
    expect(preview.emailProvider).toBe("test");
    expectConfigError(
      () =>
        loadSourceEnvironment({
          SOURCE_ENV: "preview",
          NEXT_PUBLIC_SUPABASE_URL: DEV_PREVIEW_SUPABASE_URL,
          SOURCE_APP_DATABASE_URL: DEV_APP_URL,
          SOURCE_EMAIL_MODE: "live",
          ...SECRETS,
          ...PRODUCTION_EMAIL,
        }),
      /SOURCE_EMAIL_ALLOWED_RECIPIENTS/
    );
  });

  it("fails closed when hosted Postgres runtime is missing SUPABASE_DB_CA_CERT", () => {
    expectConfigError(
      () =>
        loadSourceEnvironment({
          SOURCE_ENV: "preview",
          NEXT_PUBLIC_SUPABASE_URL: DEV_PREVIEW_SUPABASE_URL,
          SOURCE_APP_DATABASE_URL: DEV_DSN_WITH_REF,
          ...SECRETS,
        }),
      /SUPABASE_DB_CA_CERT is required for hosted Postgres TLS/
    );
    expect(() =>
      createPersistence({
        runtime: "preview",
        persistence: "postgres",
        identityProvider: "supabase",
        objectStorage: "supabase",
        appDatabaseUrl: DEV_DSN_WITH_REF,
        invitationTtlDays: 7,
        importBucket: "source-imports",
        evidenceBucket: "source-evidence",
        signedReadTtlSeconds: 300,
        tempUploadTtlHours: 24,
      })
    ).toThrow(/SUPABASE_DB_CA_CERT is required for hosted Postgres TLS/);
  });

  it("decodes escaped PEM newlines for hosted Postgres TLS without exposing the certificate", () => {
    const env = loadSourceEnvironment({
      SOURCE_ENV: "preview",
      NEXT_PUBLIC_SUPABASE_URL: DEV_PREVIEW_SUPABASE_URL,
      SOURCE_APP_DATABASE_URL: DEV_APP_URL,
      ...SECRETS,
      SUPABASE_DB_CA_CERT: "-----BEGIN CERTIFICATE-----\\nTEST-NOT-A-REAL-CA\\n-----END CERTIFICATE-----",
    });
    expect(env.supabaseDbCaCert).toBe(DUMMY_DB_CA);
  });

  it("refuses production SOURCE_EMAIL_MODE=test", () => {
    expectConfigError(
      () =>
        loadSourceEnvironment({
          SOURCE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
          SOURCE_APP_DATABASE_URL: PROD_APP_URL,
          SOURCE_EMAIL_MODE: "test",
          ...SECRETS,
          ...PRODUCTION_EMAIL,
        }),
      /production cannot use SOURCE_EMAIL_MODE=test/
    );
  });

  it("fails closed when production NEXT_PUBLIC_SOURCE_APP_URL is a Vercel Preview URL", () => {
    expectConfigError(
      () =>
        loadSourceEnvironment({
          SOURCE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
          SOURCE_APP_DATABASE_URL: PROD_APP_URL,
          ...HOSTED,
          ...PRODUCTION_EMAIL,
          NEXT_PUBLIC_SOURCE_APP_URL: "https://source-dpp-git-main.vercel.app",
        }),
      /cannot be a Vercel Preview URL/
    );
  });

  it("fails closed when production sets SOURCE_EXPOSE_INVITE_LINKS", () => {
    expectConfigError(
      () =>
        loadSourceEnvironment({
          SOURCE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
          SOURCE_APP_DATABASE_URL: PROD_APP_URL,
          SOURCE_EXPOSE_INVITE_LINKS: "1",
          ...HOSTED,
          ...PRODUCTION_EMAIL,
        }),
      /SOURCE_EXPOSE_INVITE_LINKS is not allowed/
    );
  });

  it("fails closed when production sets SOURCE_DEMO_AUTH", () => {
    expectConfigError(
      () =>
        loadSourceEnvironment({
          SOURCE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
          SOURCE_APP_DATABASE_URL: PROD_APP_URL,
          SOURCE_DEMO_AUTH: "1",
          ...HOSTED,
          ...PRODUCTION_EMAIL,
        }),
      /SOURCE_DEMO_AUTH is not allowed/
    );
  });

  it("allows hosted environments to boot without Stripe, and requires a webhook secret when the secret key is set", () => {
    const env = loadSourceEnvironment({
      SOURCE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
      SOURCE_APP_DATABASE_URL: PROD_APP_URL,
      ...HOSTED,
      ...PRODUCTION_EMAIL,
    });
    expect(env.stripeSecretKey).toBeUndefined();
    expectConfigError(
      () =>
        loadSourceEnvironment({
          SOURCE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
          SOURCE_APP_DATABASE_URL: PROD_APP_URL,
          STRIPE_SECRET_KEY: "sk_live_not_a_real_key",
          ...HOSTED,
          ...PRODUCTION_EMAIL,
        }),
      /STRIPE_WEBHOOK_SECRET is required/
    );
    const withStripe = loadSourceEnvironment({
      SOURCE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
      SOURCE_APP_DATABASE_URL: PROD_APP_URL,
      STRIPE_SECRET_KEY: "sk_live_not_a_real_key",
      STRIPE_WEBHOOK_SECRET: "whsec_test_not_a_real_secret",
      SOURCE_STRIPE_PRICE_CORE: "price_test_core",
      ...HOSTED,
      ...PRODUCTION_EMAIL,
    });
    expect(withStripe.stripePriceOverrides?.core).toBe("price_test_core");
    expect(withStripe.stripeSecretKey).toBe("sk_live_not_a_real_key");
  });
});
