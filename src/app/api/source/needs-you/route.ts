import { jsonError, principalFromRequest } from "../_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { getNeedsYouTasks } from "@/server/source/queries";

export async function GET(request: Request) {
  try {
    const principal = await principalFromRequest(request);
    return Response.json({ tasks: await getNeedsYouTasks(getPersistence(), principal) });
  } catch (error) {
    return jsonError(error);
  }
}
