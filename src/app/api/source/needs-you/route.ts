import { jsonError, principalFromRequest } from "../_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { getNeedsYouTasks } from "@/server/source/queries";

export async function GET() {
  try {
    const principal = await principalFromRequest();
    return Response.json({ tasks: await getNeedsYouTasks(getPersistence(), principal) });
  } catch (error) {
    return jsonError(error);
  }
}
