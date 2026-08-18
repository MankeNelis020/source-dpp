import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/source/safe-next";

describe("safeNextPath", () => {
  it("keeps local paths including onboarding", () => {
    expect(safeNextPath("/onboarding/organisation")).toBe("/onboarding/organisation");
    expect(safeNextPath("/app")).toBe("/app");
    expect(safeNextPath("/reset-password")).toBe("/reset-password");
  });

  it("rejects missing values with the fallback", () => {
    expect(safeNextPath(null)).toBe("/app");
    expect(safeNextPath(undefined)).toBe("/app");
    expect(safeNextPath("")).toBe("/app");
  });

  it("rejects external and protocol-relative redirects", () => {
    expect(safeNextPath("https://evil.example/phish")).toBe("/app");
    expect(safeNextPath("http://evil.example")).toBe("/app");
    expect(safeNextPath("//evil.example")).toBe("/app");
    expect(safeNextPath("///evil.example")).toBe("/app");
    expect(safeNextPath("/\\evil.example")).toBe("/app");
    expect(safeNextPath("https://app.source.test/onboarding/organisation")).toBe("/app");
  });
});
