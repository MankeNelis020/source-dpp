import { getSourceEnvironment } from "@/infrastructure/runtime";

export async function GET() {
  const env = getSourceEnvironment();
  return Response.json({
    identityProvider: env.identityProvider,
    invitationTtlDays: env.invitationTtlDays,
    appPublicUrl: env.appPublicUrl ?? null,
  });
}
