import { jsonError } from "../source/_lib";
import { loadSessionContext } from "@/server/source/principal";

export async function GET(request: Request) {
  try {
    const session = await loadSessionContext(request);
    if (!session.authenticated) {
      return Response.json({ authenticated: false });
    }
    return Response.json({
      authenticated: true,
      email: session.identity.email,
      emailVerified: session.identity.emailVerified,
      userId: session.identity.userId,
      authenticationMethod: session.identity.authenticationMethod,
      organisationId: session.principal?.organisationId,
      role: session.principal?.roles[0],
      capabilities: session.principal?.capabilities ?? [],
      memberships: session.memberships,
      nextPath: session.nextPath,
    });
  } catch (error) {
    return jsonError(error);
  }
}
