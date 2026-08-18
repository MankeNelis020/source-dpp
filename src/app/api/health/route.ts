import { getPersistenceHealth, getSourceEnvironment, bootSourceRuntime } from "@/infrastructure/runtime";
import { emailConfigurationStatus } from "@/infrastructure/email/factory";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await bootSourceRuntime();
    const env = getSourceEnvironment();
    const health = getPersistenceHealth();
    if (health.database !== "ok") {
      return Response.json(
        {
          database: "error",
          persistence: env.persistence,
          storage: health.storage ?? "error",
          email: emailConfigurationStatus(env),
        },
        { status: 503 }
      );
    }
    return Response.json({
      database: "ok",
      persistence: health.persistence,
      storage: health.storage ?? "ok",
      email: emailConfigurationStatus(env),
    });
  } catch {
    return Response.json({ database: "error", persistence: "postgres", storage: "error", email: "unconfigured" }, { status: 503 });
  }
}
