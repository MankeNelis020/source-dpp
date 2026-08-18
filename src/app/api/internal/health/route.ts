import { jsonError } from "../../source/_lib";
import { getPersistence, getPersistenceHealth } from "@/infrastructure/runtime";
import { requireCronSecret } from "@/server/source/cron-auth";
import { emailConfigurationStatus } from "@/infrastructure/email/factory";
import { loadSourceEnvironment } from "@/infrastructure/environment/source-environment";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireCronSecret(request);
    const env = loadSourceEnvironment();
    const health = getPersistenceHealth();
    const store = getPersistence();
    const pending = (await store.countOutbox("PENDING")) + (await store.countOutbox("FAILED"));
    const dead = await store.countOutbox("DEAD_LETTER");
    return Response.json({
      database: health.database,
      persistence: health.persistence,
      storage: health.storage ?? "ok",
      email: emailConfigurationStatus(env),
      outboxBacklog: pending,
      outboxDeadLetter: dead,
    });
  } catch (error) {
    return jsonError(error);
  }
}
