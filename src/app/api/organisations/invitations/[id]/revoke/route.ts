import { getPersistence } from "@/infrastructure/runtime";
import { jsonError, originAllowed, principalFromRequest } from "../../../../source/_lib";
import { revokeInvitation } from "@/server/source/organisations";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!originAllowed(request)) {
      return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    }
    const principal = await principalFromRequest(request);
    const { id } = await context.params;
    await revokeInvitation({ store: getPersistence(), principal, invitationId: id });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
