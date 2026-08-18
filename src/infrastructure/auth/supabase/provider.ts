import type { AuthIdentity, IdentityProvider } from "../identity";
import { createServerSupabaseClient } from "./server";

/**
 * Verifies the human with Supabase Auth (`getUser`).
 * Does not read user_metadata for organisation, role, or admin flags.
 * SOURCE membership rows remain the authorization source.
 */
export class SupabaseIdentityProvider implements IdentityProvider {
  async getAuthenticatedUser(_request: Request): Promise<AuthIdentity | null> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id || !data.user.email) return null;
    return {
      userId: data.user.id,
      email: data.user.email.trim().toLowerCase(),
      emailVerified: Boolean(data.user.email_confirmed_at),
      displayName:
        typeof data.user.user_metadata?.display_name === "string"
          ? data.user.user_metadata.display_name
          : undefined,
      authenticationMethod: "SUPABASE",
    };
  }

  async signOut(): Promise<void> {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  }
}
