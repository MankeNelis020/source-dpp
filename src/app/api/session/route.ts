import { jsonError, principalFromRequest } from "../source/_lib";

export async function GET() {
  try {
    const principal = await principalFromRequest();
    return Response.json({
      userId: principal.userId,
      organisationId: principal.organisationId,
      email: principal.email,
      roles: principal.roles,
    });
  } catch (error) {
    return jsonError(error);
  }
}
