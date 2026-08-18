import { jsonError, principalFromRequest } from "../_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { getCaseList } from "@/server/source/queries";
import type { CaseFilter } from "@/domain/source/types";

export async function GET(request: Request) {
  try {
    const principal = await principalFromRequest();
    const filter = (new URL(request.url).searchParams.get("filter") ?? "all") as CaseFilter;
    return Response.json({ cases: await getCaseList(getPersistence(), principal, filter) });
  } catch (error) {
    return jsonError(error);
  }
}
