import { describe, expect, it } from "vitest";
import {
  clearDraftForCase,
  dispatchCopy,
  draftForCase,
  emptyPortalDraft,
  outreachQueued,
  parsePortalSearch,
  patchDraftForCase,
  portalPath,
} from "./portal-draft";

describe("supplier portal requirement draft isolation", () => {
  it("keeps Product A and Product B drafts independent", () => {
    let map = patchDraftForCase({}, "case-a", { action: "unknown", unknownRoute: "cannot_determine" });
    map = patchDraftForCase(map, "case-b", { action: "original", disclosureMode: "SHARE_SOURCE" });

    expect(draftForCase(map, "case-a").action).toBe("unknown");
    expect(draftForCase(map, "case-a").unknownRoute).toBe("cannot_determine");
    expect(draftForCase(map, "case-a").disclosureMode).toBe("PROTECTED_SOURCE");

    expect(draftForCase(map, "case-b").action).toBe("original");
    expect(draftForCase(map, "case-b").unknownRoute).toBeNull();
    expect(draftForCase(map, "case-b").disclosureMode).toBe("SHARE_SOURCE");

    map = patchDraftForCase(map, "case-a", { action: "colleague", colleagueEmail: "a@example.test" });
    expect(draftForCase(map, "case-b").action).toBe("original");
    expect(draftForCase(map, "case-b").colleagueEmail).toBe("");
  });

  it("returns a fresh empty draft for a case that has never been opened", () => {
    const map = patchDraftForCase({}, "case-a", { action: "unknown" });
    expect(draftForCase(map, "case-b")).toEqual(emptyPortalDraft());
    expect(draftForCase(map, "case-b").action).toBeNull();
  });

  it("clears one case without affecting another", () => {
    let map = patchDraftForCase({}, "case-a", { action: "unknown" });
    map = patchDraftForCase(map, "case-b", { action: "upstream" });
    map = clearDraftForCase(map, "case-a");
    expect(draftForCase(map, "case-a").action).toBeNull();
    expect(draftForCase(map, "case-b").action).toBe("upstream");
  });
});

describe("supplier portal navigation", () => {
  it("round-trips requirement URLs so browser back can restore the case", () => {
    const path = portalPath("tok", "requirement", "SRC-1");
    expect(path).toBe("/s/tok?view=requirement&case=SRC-1");
    expect(parsePortalSearch("view=requirement&case=SRC-1")).toEqual({ view: "requirement", caseId: "SRC-1" });
    expect(parsePortalSearch(path.slice(path.indexOf("?")))).toEqual({ view: "requirement", caseId: "SRC-1" });
    expect(portalPath("tok", "request")).toBe("/s/tok?view=request");
  });

  it("keeps per-requirement drafts when the URL returns to the request list", () => {
    const map = patchDraftForCase({}, "SRC-1", { action: "unknown", unknownRoute: "ask_supplier" });
    expect(parsePortalSearch("view=request")).toEqual({ view: "request", caseId: null });
    expect(draftForCase(map, "SRC-1").action).toBe("unknown");
    expect(draftForCase(map, "SRC-1").unknownRoute).toBe("ask_supplier");
  });
});

describe("dispatch copy truthfulness", () => {
  it("never says request sent when only an organisation is known", () => {
    const copy = dispatchCopy({ kind: "upstream", queued: false, hasEmail: false, hasOrganisation: true });
    expect(copy.message).toMatch(/request not sent/i);
    expect(copy.message.toLowerCase()).not.toContain("request sent");
    expect(copy.confirmation).toContain("contact details missing");
  });

  it("says queued only when outreach was created", () => {
    const copy = dispatchCopy({ kind: "colleague", queued: true, hasEmail: true, hasOrganisation: false });
    expect(copy.message).toMatch(/queued/i);
    expect(copy.message.toLowerCase()).not.toContain("request sent");
  });

  it("detects an outbound queue side effect and ignores empty outcomes", () => {
    expect(outreachQueued({ sideEffects: [{ type: "email.queued", key: "SRC-1:DELEGATE:1:v1" }] })).toBe(true);
    expect(outreachQueued({ sideEffects: [] })).toBe(false);
    expect(outreachQueued({})).toBe(false);
  });
});
