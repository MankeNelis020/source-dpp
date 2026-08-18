import type { AuthIdentity, IdentityProvider } from "./identity";
import { TEST_IDENTITY_HEADER } from "./identity";

export function parseTestIdentity(raw: string | null | undefined): AuthIdentity | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthIdentity>;
    if (!parsed.userId || !parsed.email) return null;
    return {
      userId: String(parsed.userId),
      email: String(parsed.email).trim().toLowerCase(),
      emailVerified: parsed.emailVerified !== false,
      displayName: parsed.displayName,
      authenticationMethod: "TEST",
    };
  } catch {
    return null;
  }
}

/**
 * Local/CI adapter. Preview and production must not use this.
 * Identity is supplied by a request header or cookie — never by tenant body fields.
 */
export class TestIdentityProvider implements IdentityProvider {
  constructor(private readonly fixed?: AuthIdentity | null) {}

  async getAuthenticatedUser(request: Request): Promise<AuthIdentity | null> {
    if (this.fixed !== undefined) return this.fixed;
    const header = parseTestIdentity(request.headers.get(TEST_IDENTITY_HEADER));
    if (header) return header;
    const cookie = cookieValue(request.headers.get("cookie") ?? "", "source_test_identity");
    return parseTestIdentity(cookie ? decodeURIComponent(cookie) : null);
  }
}

function cookieValue(header: string, name: string): string | undefined {
  const parts = header.split(";");
  for (const part of parts) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}
