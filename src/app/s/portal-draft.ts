import type { CannotProvideReason, DisclosureMode, EvidenceReusePolicy, UnknownChoice, UpstreamContactMode } from "@/domain/source";
import { SUPPLIER_ACTIONS } from "@/domain/source/copy";

export type PortalActionId = (typeof SUPPLIER_ACTIONS)[number]["id"];

export type UnknownRoute = "ask_supplier" | "assign_colleague" | "cannot_determine";

export interface PortalRequirementDraft {
  action: PortalActionId | null;
  unknownRoute: UnknownRoute | null;
  value: string;
  unknown: UnknownChoice;
  upstreamMode: UpstreamContactMode;
  upstreamName: string;
  upstreamEmail: string;
  upstreamContactName: string;
  colleagueEmail: string;
  colleagueName: string;
  evidenceFile: File | null;
  reusePolicy: EvidenceReusePolicy;
  disclosureMode: DisclosureMode;
  cannotReason: CannotProvideReason;
  attestation: {
    legalEntity: string;
    personName: string;
    role: string;
    statement: string;
  };
  supportIds: string[];
}

export type PortalDraftMap = Record<string, PortalRequirementDraft>;

export function emptyPortalDraft(): PortalRequirementDraft {
  return {
    action: null,
    unknownRoute: null,
    value: "",
    unknown: "ask_supplier",
    upstreamMode: "confidential",
    upstreamName: "",
    upstreamEmail: "",
    upstreamContactName: "",
    colleagueEmail: "",
    colleagueName: "",
    evidenceFile: null,
    reusePolicy: "ASK_FOR_REUSE",
    disclosureMode: "PROTECTED_SOURCE",
    cannotReason: "commercially_sensitive",
    attestation: { legalEntity: "", personName: "", role: "", statement: "" },
    supportIds: [],
  };
}

export function draftForCase(map: PortalDraftMap, caseId: string): PortalRequirementDraft {
  return map[caseId] ?? emptyPortalDraft();
}

export function patchDraftForCase(
  map: PortalDraftMap,
  caseId: string,
  patch: Partial<PortalRequirementDraft>
): PortalDraftMap {
  return {
    ...map,
    [caseId]: { ...draftForCase(map, caseId), ...patch },
  };
}

export function clearDraftForCase(map: PortalDraftMap, caseId: string): PortalDraftMap {
  const next = { ...map };
  delete next[caseId];
  return next;
}

export type PortalViewName = "land" | "terms" | "request" | "requirement" | "done";

export function parsePortalSearch(search: string | URLSearchParams): { view: PortalViewName; caseId: string | null } {
  const params = typeof search === "string" ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search) : search;
  const viewRaw = params.get("view");
  const caseId = params.get("case");
  const view: PortalViewName =
    viewRaw === "terms" || viewRaw === "request" || viewRaw === "requirement" || viewRaw === "done" ? viewRaw : "land";
  return { view, caseId: caseId && caseId.trim() ? caseId : null };
}

export function portalPath(token: string, view: PortalViewName, caseId?: string | null): string {
  const params = new URLSearchParams();
  if (view !== "land") params.set("view", view);
  if (caseId && (view === "requirement" || view === "done")) params.set("case", caseId);
  const query = params.toString();
  return query ? `/s/${token}?${query}` : `/s/${token}`;
}

export function outreachQueued(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const side = (result as { sideEffects?: { type?: string }[] }).sideEffects;
  return Array.isArray(side) && side.some((row) => row.type === "email.queued");
}

export function dispatchCopy(input: {
  kind: "colleague" | "upstream" | "unknown" | "evidence";
  queued: boolean;
  hasEmail: boolean;
  hasOrganisation: boolean;
}): { message: string; confirmation: string } {
  if (input.kind === "colleague") {
    if (input.queued) {
      return {
        message: "Request queued for this person. They will receive a scoped link for this requirement only.",
        confirmation: "next owner identified · request queued",
      };
    }
    return {
      message: "Next owner identified. Request not sent.",
      confirmation: "next owner identified · contact details missing or request not queued",
    };
  }
  if (input.kind === "upstream") {
    if (!input.hasOrganisation) {
      return { message: "Name the supplier organisation first.", confirmation: "contact details missing" };
    }
    if (!input.hasEmail) {
      return {
        message: "Contact details required — request not sent.",
        confirmation: "next owner identified · contact details missing",
      };
    }
    if (input.queued) {
      return {
        message: "Request queued for this supplier. The original requirement stays the same.",
        confirmation: "next owner identified · request queued",
      };
    }
    return {
      message: "Next owner identified. Request not sent.",
      confirmation: "next owner identified · request not queued",
    };
  }
  if (input.kind === "unknown") {
    return {
      message: "Recorded. This does not answer the requirement. Choose a next owner for this product only.",
      confirmation: "unresolved routing · not ready",
    };
  }
  return {
    message: "Evidence received. SOURCE will assess whether it supports this requirement.",
    confirmation: "response received",
  };
}
