import { jsonError } from "../../../source/_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { requireCronSecret } from "@/server/source/cron-auth";
import { tickDueOrganisations } from "@/server/source/engine-tick";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireCronSecret(request);
    const result = await tickDueOrganisations(getPersistence());
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  return POST(request);
}
