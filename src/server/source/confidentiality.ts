import { visibleActorName } from "@/domain/source/cycles";
import type { AuditEvent, EngineState, EvidenceRecord, ResolutionCase } from "@/domain/source/types";

export type ActorProjection =
  | {
      kind: "visible";
      id: string;
      name: string;
      legalName: string;
      country: string;
    }
  | {
      kind: "protected";
      sourceType: "PROTECTED_UPSTREAM_SOURCE";
      identityVisible: false;
      trustLevel: "VERIFIED";
    };

export function isConfidentialActor(state: EngineState, actorId: string | undefined): boolean {
  if (!actorId) return false;
  const actor = state.actors.find((a) => a.id === actorId);
  if (actor?.confidential) return true;
  const rel = state.relationships.find((r) => r.toActorId === actorId);
  return Boolean(rel?.confidentialUpstream);
}

export function projectActor(state: EngineState, actorId: string | undefined): ActorProjection | undefined {
  if (!actorId) return undefined;
  if (isConfidentialActor(state, actorId)) {
    return {
      kind: "protected",
      sourceType: "PROTECTED_UPSTREAM_SOURCE",
      identityVisible: false,
      trustLevel: "VERIFIED",
    };
  }
  const actor = state.actors.find((a) => a.id === actorId);
  if (!actor) return undefined;
  return {
    kind: "visible",
    id: actor.id,
    name: actor.name,
    legalName: actor.legalName,
    country: actor.country,
  };
}

export function safeActorLabel(state: EngineState, actorId: string | undefined): string {
  if (!actorId) return "Unassigned";
  const actor = state.actors.find((a) => a.id === actorId);
  const rel = state.relationships.find((r) => r.toActorId === actorId);
  return visibleActorName({
    actorName: actor?.name ?? "Known actor",
    viewerIsManufacturer: true,
    confidentialUpstream: Boolean(actor?.confidential || rel?.confidentialUpstream),
  });
}

export function projectEvidence(
  evidence: EvidenceRecord | undefined,
  canReadPrivate: boolean
): { id: string; filename?: string; expired: boolean; status: string } | undefined {
  if (!evidence) return undefined;
  if (evidence.visibility === "private" && !canReadPrivate) {
    return { id: evidence.id, expired: evidence.expired, status: "verified" };
  }
  if (evidence.visibility === "protected") {
    return { id: evidence.id, expired: evidence.expired, status: "verified" };
  }
  return {
    id: evidence.id,
    filename: evidence.filename,
    expired: evidence.expired,
    status: evidence.expired ? "expired" : "on_file",
  };
}

export function sanitizeAudit(state: EngineState, event: AuditEvent): { id: string; type: string; timestamp: string; detail: string; policy?: string } {
  let detail = event.detail;
  for (const actor of state.actors) {
    if (!isConfidentialActor(state, actor.id)) continue;
    detail = detail.replaceAll(actor.name, "verified upstream source").replaceAll(actor.legalName, "verified upstream source").replaceAll(actor.id, "protected");
  }
  return {
    id: event.id,
    type: event.type,
    timestamp: event.timestamp,
    detail,
    policy: event.policy,
  };
}

export function leakScan(payload: unknown): string[] {
  const text = JSON.stringify(payload);
  const leaks: string[] = [];
  if (text.includes("mill-north")) leaks.push("mill-north");
  if (text.includes("mill-private")) leaks.push("mill-private");
  if (text.includes("Secret Mill")) leaks.push("Secret Mill");
  if (text.includes("Nordic Fibre Mill")) leaks.push("Nordic Fibre Mill");
  if (text.includes("portalToken")) leaks.push("portalToken");
  if (text.includes("nordic-origin-certificate")) leaks.push("foreign-evidence-filename");
  return leaks;
}

export function caseWithoutSecrets(resolution: ResolutionCase) {
  const { portalToken, currentActorId, ...rest } = resolution;
  void portalToken;
  void currentActorId;
  return rest;
}
