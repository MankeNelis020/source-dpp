import { jsonError } from "../../../source/_lib";
import { getPersistence, getRuntimeEmailProvider } from "@/infrastructure/runtime";
import { processOutboxBatch } from "@/infrastructure/outbox/processor";
import { requireCronSecret } from "@/server/source/cron-auth";
import { loadSourceEnvironment } from "@/infrastructure/environment/source-environment";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireCronSecret(request);
    const env = loadSourceEnvironment();
    const result = await processOutboxBatch({
      store: getPersistence(),
      email: getRuntimeEmailProvider(),
      limit: env.outboxBatchSize,
    });
    return Response.json({
      claimed: result.claimed,
      succeeded: result.succeeded,
      failed: result.failed,
      deadLetter: result.deadLetters.length,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  return POST(request);
}
