import { getPersistence } from "@/infrastructure/runtime";
import { requireOrganisationPrincipal } from "@/server/source/principal";
import { SourceError, type Principal } from "@/server/source/types";
export { originAllowed } from "@/server/source/http-security";

export function jsonError(error: unknown) {
  if (error instanceof SourceError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.httpStatus });
  }
  return Response.json({ error: "ERROR", message: "Request failed." }, { status: 500 });
}

export async function principalFromRequest(request: Request): Promise<Principal> {
  void getPersistence();
  return requireOrganisationPrincipal(request);
}
