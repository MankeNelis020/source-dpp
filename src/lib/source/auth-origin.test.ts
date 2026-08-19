import { describe, expect, it } from "vitest";
import { authEmailRedirectTo } from "@/lib/source/auth-origin";

describe("authEmailRedirectTo", () => {
  it("uses the configured public origin and encodes the next path", () => {
    expect(authEmailRedirectTo("https://source-dpp.eu", "/onboarding/organisation")).toBe(
      "https://source-dpp.eu/auth/callback?next=%2Fonboarding%2Forganisation"
    );
  });

  it("strips a trailing slash from the configured origin", () => {
    expect(authEmailRedirectTo("https://source-dpp.eu/", "/app")).toBe(
      "https://source-dpp.eu/auth/callback?next=%2Fapp"
    );
  });
});
