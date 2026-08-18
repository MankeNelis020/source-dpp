import { jsonError, principalFromRequest } from "../../../source/_lib";
import { getPersistence } from "@/infrastructure/runtime";
import { getImportProgress } from "@/server/source/import/service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await principalFromRequest();
    const { id } = await context.params;
    const progress = await getImportProgress(getPersistence(), principal, id);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const event of progress.events) {
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
