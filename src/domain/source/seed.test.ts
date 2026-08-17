import { describe, expect, it } from "vitest";
import { MVP_FLOWS, createSeedState } from "./seed";

describe("MVP unhappy flows are seeded", () => {
  it("covers the fifteen production failure flows", () => {
    const state = createSeedState();
    const codes = new Set(MVP_FLOWS.map((f) => f.caseId));
    expect(codes.size).toBe(15);
    for (const flow of MVP_FLOWS) {
      const resolution = state.cases.find((c) => c.id === flow.caseId);
      expect(resolution, flow.caseId).toBeTruthy();
      expect(resolution?.blockingReason).toBe(flow.code);
      expect(resolution?.nextAction).toBeTruthy();
      expect(resolution?.ownerLabel).toBeTruthy();
    }
  });
});
