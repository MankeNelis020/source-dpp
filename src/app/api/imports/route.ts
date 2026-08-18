import { jsonError, originAllowed, principalFromRequest } from "../source/_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { createImportJob } from "@/server/source/import/service";

export async function GET(request: Request) {
  try {
    const principal = await principalFromRequest(request);
    const jobs = await getPersistence().listImportJobs(principal.organisationId);
    return Response.json({ jobs });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!originAllowed(request)) return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    const principal = await principalFromRequest(request);
    const body = (await request.json()) as { products?: string; suppliers?: string; bom?: string; materials?: string };
    const job = await createImportJob(getPersistence(), principal, body);
    return Response.json(job);
  } catch (error) {
    return jsonError(error);
  }
}
