import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUPPLIER_REFERENCE_MODE,
  introductionContainsIdentity,
  introductionCopy,
  referenceModeFromUpstream,
  resolveSupplierReferenceMode,
  upstreamModeFromReference,
} from "./reference-mode";

const REQUESTER = "Acme Manufacturing B.V.";
const CURRENT = "Supplier A GmbH";

describe("supplier reference modes", () => {
  it("defaults to NO_REFERENCE, the least-permissive introduction", () => {
    expect(DEFAULT_SUPPLIER_REFERENCE_MODE).toBe("NO_REFERENCE");
    expect(resolveSupplierReferenceMode({})).toBe("NO_REFERENCE");
    expect(referenceModeFromUpstream("confidential")).toBe("NO_REFERENCE");
    expect(upstreamModeFromReference("NO_REFERENCE")).toBe("confidential");
  });

  it("does not name either organisation in NO_REFERENCE copy even when names are supplied", () => {
    const copy = introductionCopy({
      mode: "NO_REFERENCE",
      currentOrganisationName: CURRENT,
      requestingOrganisationName: REQUESTER,
    });
    expect(introductionContainsIdentity(copy, CURRENT)).toBe(false);
    expect(introductionContainsIdentity(copy, REQUESTER)).toBe(false);
    expect(copy.subject).toBe("Product information requested through SOURCE");
  });

  it("names only the delegating organisation in CURRENT_ORGANISATION copy", () => {
    const copy = introductionCopy({
      mode: "CURRENT_ORGANISATION",
      currentOrganisationName: CURRENT,
      requestingOrganisationName: REQUESTER,
    });
    expect(introductionContainsIdentity(copy, CURRENT)).toBe(true);
    expect(introductionContainsIdentity(copy, REQUESTER)).toBe(false);
  });

  it("may name both organisations only in FULL_REFERENCE copy", () => {
    const copy = introductionCopy({
      mode: "FULL_REFERENCE",
      currentOrganisationName: CURRENT,
      requestingOrganisationName: REQUESTER,
    });
    expect(introductionContainsIdentity(copy, CURRENT)).toBe(true);
    expect(introductionContainsIdentity(copy, REQUESTER)).toBe(true);
  });

  it("does not let a parent FULL_REFERENCE escalate a later NO_REFERENCE introduction", () => {
    const parent = introductionCopy({
      mode: "FULL_REFERENCE",
      currentOrganisationName: CURRENT,
      requestingOrganisationName: REQUESTER,
    });
    const child = introductionCopy({
      mode: "NO_REFERENCE",
      currentOrganisationName: CURRENT,
      requestingOrganisationName: REQUESTER,
    });
    expect(introductionContainsIdentity(parent, REQUESTER)).toBe(true);
    expect(introductionContainsIdentity(child, REQUESTER)).toBe(false);
    expect(introductionContainsIdentity(child, CURRENT)).toBe(false);
  });
});
