import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/infrastructure/environment/source-environment", () => ({
  loadSourceEnvironment: vi.fn(() => ({
    identityProvider: "supabase",
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "test-anon-key",
    runtime: "preview",
  })),
}));

vi.mock("@/infrastructure/auth/supabase/middleware", async () => {
  const actual = await vi.importActual<typeof import("@/infrastructure/auth/supabase/middleware")>(
    "@/infrastructure/auth/supabase/middleware"
  );
  return {
    ...actual,
    refreshSupabaseAuth: vi.fn(async (request: NextRequest) => NextResponse.next({ request })),
  };
});

import { middleware } from "@/middleware";
import { refreshSupabaseAuth, shouldRefreshSupabaseAuth } from "@/infrastructure/auth/supabase/middleware";

describe("auth callback middleware", () => {
  beforeEach(() => {
    vi.mocked(refreshSupabaseAuth).mockClear();
  });

  it("does not refresh the Supabase session on /auth/callback", () => {
    expect(shouldRefreshSupabaseAuth("/auth/callback")).toBe(false);
    expect(shouldRefreshSupabaseAuth("/app")).toBe(true);
  });

  it("does not call session refresh when the confirmation link hits the callback", async () => {
    const request = new NextRequest(
      "https://app.source.test/auth/callback?code=one-time-code&next=/onboarding/organisation",
      {
        headers: {
          cookie: "sb-example-auth-token-code-verifier=pkce-verifier-cookie-value",
        },
      }
    );
    const response = await middleware(request);
    expect(refreshSupabaseAuth).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
