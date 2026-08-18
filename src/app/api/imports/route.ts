import { jsonError, originAllowed, principalFromRequest } from "../source/_lib";
import { getPersistence, getRuntimeObjectStorage, getSourceEnvironment } from "@/infrastructure/runtime";
import { createImportJob, createImportJobFromStorage } from "@/server/source/import/service";
import { SourceError } from "@/server/source/types";

export async function GET(request: Request) {
  try {
    const principal = await principalFromRequest(request);
    const jobs = await getPersistence().listImportJobs(principal.organisationId);
    return Response.json({
      jobs: jobs.map((job) => ({
        id: job.id,
        state: job.state,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        processedCount: job.processedCount,
        totalCount: job.totalCount,
        warningCount: job.warningCount,
        errorCount: job.errorCount,
        reviewCount: job.reviewCount,
        sourceFiles: job.sourceFiles,
        summary: job.summary,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!originAllowed(request)) return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    const principal = await principalFromRequest(request);
    const body = (await request.json()) as {
      products?: string;
      suppliers?: string;
      bom?: string;
      materials?: string;
      storageObjectIds?: { products?: string; suppliers?: string; bom?: string; materials?: string };
    };
    if (body.storageObjectIds) {
      const job = await createImportJobFromStorage(getPersistence(), principal, body.storageObjectIds, new Date(), {
        objectStorage: getRuntimeObjectStorage(),
      });
      return Response.json(job);
    }
    const env = getSourceEnvironment();
    if (env.runtime === "preview" || env.runtime === "production" || env.objectStorage === "supabase") {
      throw new SourceError("VALIDATION", "Upload a catalogue file. Pasted CSV is not accepted in this environment.", 400);
    }
    const job = await createImportJob(getPersistence(), principal, body, new Date(), {
      objectStorage: getRuntimeObjectStorage(),
    });
    return Response.json(job);
  } catch (error) {
    return jsonError(error);
  }
}
