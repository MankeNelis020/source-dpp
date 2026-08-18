import { visibleActorName } from "@/domain/source/cycles";
import type { AuditEvent, EngineState, EvidenceRecord, ResolutionCase } from "@/domain/source/types";
import {
  evaluateActorDisclosure,
  evaluateEvidenceDisclosure,
  isConfidentialActor,
  projectEvidenceRecord,
  type EvidenceProjection,
} from "./disclosure";
import { projectDomainEvent, fallbackSanitizeText, type AuditProjection } from "./audit";
import type { Capability } from "./types";

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

export { isConfidentialActor };

export function projectActor(state: EngineState, actorId: string | undefined): ActorProjection | undefined {
  if (!actorId) return undefined;
  const decision = evaluateActorDisclosure(state, actorId);
  if (!decision.canRevealIdentity) {
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
  organisationId: string,
  evidence: EvidenceRecord | undefined,
  capabilities: Capability[]
): EvidenceProjection | undefined {
  if (!evidence) return undefined;
  const decision = evaluateEvidenceDisclosure({
    state: { tenant: { id: organisationId } } as EngineState,
    evidence,
    capabilities,
    organisationId,
  });
  // Visibility must be evaluated with the real engine state for confidential owners.
  return projectEvidenceRecord(organisationId, evidence, decision);
}

export function projectEvidenceForState(
  state: EngineState,
  evidence: EvidenceRecord | undefined,
  capabilities: Capability[]
): EvidenceProjection | undefined {
  if (!evidence) return undefined;
  const decision = evaluateEvidenceDisclosure({
    state,
    evidence,
    capabilities,
    organisationId: state.tenant.id,
  });
  return projectEvidenceRecord(state.tenant.id, evidence, decision);
}

/** @deprecated Primary enforcement is structured disclosure. Kept as a defensive fallback. */
export function sanitizeAudit(state: EngineState, event: AuditEvent): AuditProjection {
  return projectDomainEvent(state, event, "tenant");
}

export function leakScan(payload: unknown, extraSecrets: string[] = []): string[] {
  const text = JSON.stringify(payload);
  const leaks: string[] = [];
  const secrets = [
    "mill-north",
    "mill-private",
    "Secret Mill",
    "Nordic Fibre Mill",
    "portalToken",
    "nordic-origin-certificate",
    ...extraSecrets,
  ];
  for (const secret of secrets) {
    if (secret && text.includes(secret) && !leaks.includes(secret)) leaks.push(secret);
  }
  return leaks;
}

export function assertNoLeaks(payload: unknown, secrets: string[]) {
  const serialized = JSON.stringify(payload);
  const hits = secrets.filter((s) => s.length >= 3 && serialized.includes(s));
  if (hits.length) {
    throw new Error(`Projection leaked confidential values: ${hits.join(", ")}`);
  }
  return serialized;
}

export function defensiveSanitize(state: EngineState, text: string): string {
  return fallbackSanitizeText(state, text);
}

export function caseWithoutSecrets(resolution: ResolutionCase) {
  const { portalToken, currentActorId, ...rest } = resolution;
  void portalToken;
  void currentActorId;
  return rest;
}
