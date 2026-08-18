export interface AuthIdentity {
  userId: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  authenticationMethod: "SUPABASE" | "TEST";
}

/**
 * Authenticates the human. SOURCE still authorizes via membership rows.
 * Never read organisation, role, or admin flags from user_metadata.
 */
export interface IdentityProvider {
  getAuthenticatedUser(request: Request): Promise<AuthIdentity | null>;
  signOut?(request: Request): Promise<void>;
}

export const TEST_IDENTITY_HEADER = "x-source-test-identity";
