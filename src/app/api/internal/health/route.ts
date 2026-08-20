import { jsonError } from "../../source/_lib";
import {
  bootSourceRuntime,
  getPersistence,
  getPersistenceHealth,
  getSourceEnvironment,
} from "@/infrastructure/runtime";
import { requireCronSecret } from "@/server/source/cron-auth";
import { emailConfigurationStatus } from "@/infrastructure/email/factory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireCronSecret(request);
  } catch (error) {
    return jsonError(error);
  }

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
    const store = getPersistence();
    const pending = (await store.countOutbox("PENDING")) + (await store.countOutbox("FAILED"));
    const dead = await store.countOutbox("DEAD_LETTER");
    return Response.json({
      database: "ok",
      persistence: health.persistence,
      storage: health.storage ?? "ok",
      email: emailConfigurationStatus(env),
      outboxBacklog: pending,
      outboxDeadLetter: dead,
    });
  } catch {
    return Response.json(
      { database: "error", persistence: "postgres", storage: "error", email: "unconfigured" },
      { status: 503 }
    );
  }
}
