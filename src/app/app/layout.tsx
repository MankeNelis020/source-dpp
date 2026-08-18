import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPersistence } from "@/infrastructure/runtime";
import { getIdentityProvider } from "@/infrastructure/auth/identity-factory";
import { ACTIVE_ORG_COOKIE, decodeActiveOrganisation } from "@/server/source/principal";
import { activeMembershipsForIdentity } from "@/server/source/organisations";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await (await import("next/headers")).headers();
  const request = new Request("http://source.local/app", {
    headers: { cookie: headerStore.get("cookie") ?? "" },
  });
  const identity = await getIdentityProvider().getAuthenticatedUser(request);
  if (!identity) redirect("/login?next=/app");
  if (!identity.emailVerified) redirect("/verify-email");
  const memberships = await activeMembershipsForIdentity(getPersistence(), identity.userId);
  if (!memberships.length) redirect("/onboarding/organisation");
  if (memberships.length > 1) {
    const jar = await cookies();
    const selected = decodeActiveOrganisation(jar.get(ACTIVE_ORG_COOKIE)?.value, identity.userId);
    if (!selected || !memberships.some((row) => row.organisationId === selected)) {
      redirect("/select-organisation");
    }
  }
  return children;
}
