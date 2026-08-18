import { jsonError, originAllowed, principalFromRequest } from "../source/_lib";
import { getMemoryPersistence } from "@/infrastructure/database/memory";
import { createImportJob } from "@/server/source/import/service";

export async function GET() {
  try {
    const principal = await principalFromRequest();
    const jobs = getMemoryPersistence().listImportJobs(principal.organisationId);
    return Response.json({ jobs });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!originAllowed(request)) return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    const principal = await principalFromRequest();
    const body = (await request.json()) as { products?: string; suppliers?: string; bom?: string; materials?: string };
    const job = createImportJob(getMemoryPersistence(), principal, body);
    return Response.json(job);
  } catch (error) {
    return jsonError(error);
  }
}
