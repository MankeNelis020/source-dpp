import { getPersistence } from "@/infrastructure/runtime";
import { jsonError, originAllowed, principalFromRequest } from "../../../source/_lib";
import { requireCapability } from "@/server/source/principal";
import { changeMembershipRole, listTeam, suspendMembership } from "@/server/source/organisations";
import type { Role } from "@/server/source/types";

export async function GET(request: Request) {
  try {
    const principal = await principalFromRequest(request);
    requireCapability(principal, "organisation:manage");
    return Response.json(await listTeam(getPersistence(), principal));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!originAllowed(request)) {
      return Response.json({ error: "FORBIDDEN", message: "Invalid origin." }, { status: 403 });
    }
    const principal = await principalFromRequest(request);
    const { id } = await context.params;
    const body = (await request.json()) as { role?: Role; status?: "SUSPENDED" };
    if (body.status === "SUSPENDED") {
      const membership = await suspendMembership({
        store: getPersistence(),
        principal,
        membershipId: id,
      });
      return Response.json({ id: membership.id, role: membership.role, status: membership.status });
    }
    if (!body.role) {
      return Response.json({ error: "VALIDATION", message: "Role required." }, { status: 400 });
    }
    const membership = await changeMembershipRole({
      store: getPersistence(),
      principal,
      membershipId: id,
      role: body.role,
    });
    return Response.json({ id: membership.id, role: membership.role, status: membership.status });
  } catch (error) {
    return jsonError(error);
  }
}
