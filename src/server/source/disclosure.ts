import { createCipheriv, createDecipheriv, createHash, createHmac } from "node:crypto";
import type { Actor, EngineState, EvidenceRecord, TrustLevel } from "@/domain/source/types";
import type { Capability, Principal } from "./types";

export function isConfidentialActor(state: EngineState, actorId: string | undefined): boolean {
  if (!actorId) return false;
  const actor = state.actors.find((a) => a.id === actorId);
  if (actor?.confidential) return true;
  const rel = state.relationships.find((r) => r.toActorId === actorId);
  return Boolean(rel?.confidentialUpstream);
}

export type DisclosureLevel =
  | "FULL"
  | "VALUE_ONLY"
  | "ATTESTATION_ONLY"
  | "METADATA_ONLY"
  | "EXISTENCE_ONLY"
  | "NONE";

export interface DisclosureDecision {
  level: DisclosureLevel;
  canRevealIdentity: boolean;
  canRevealEvidenceId: boolean;
  canRevealFilename: boolean;
  canRevealIssuer: boolean;
  canRevealValue: boolean;
  canRevealValidity: boolean;
  canRevealOwner: boolean;
  canRevealHash: boolean;
  canRevealStorageKey: boolean;
  canIssueSignedUrl: boolean;
  reason: string;
  policyVersion: "p01-v1";
}

export const DISCLOSURE_POLICY_VERSION = "p01-v1" as const;

function opaqueSecret(): string {
  const secret = process.env.SOURCE_OPAQUE_REF_SECRET ?? process.env.SOURCE_SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production" && process.env.SOURCE_DEMO_AUTH !== "1") {
    throw new Error("SOURCE_OPAQUE_REF_SECRET is required in production.");
  }
  return "source-demo-opaque-ref-not-for-production";
}

function opaqueKey(): Buffer {
  return createHash("sha256").update(`source-opaque-v1:${opaqueSecret()}`).digest();
}

/**
 * Tenant-scoped opaque evidence handle. AES-256-GCM with organisationId as AAD:
 * decode is O(1) and does not scan the tenant evidence list.
 * The canonical evidence id is not readable from the token.
 * IV is derived from (org, evidenceId) so the same object keeps a stable ref.
 */
export function opaqueEvidenceRef(organisationId: string, evidenceId: string): string {
  const key = opaqueKey();
  const iv = createHmac("sha256", key).update(`iv:${organisationId}:${evidenceId}`).digest().subarray(0, 12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(organisationId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(evidenceId, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `evr1_${Buffer.concat([iv, tag, ciphertext]).toString("base64url")}`;
}

export function resolveEvidenceIdFromOpaqueRef(organisationId: string, ref: string): string | undefined {
  if (!ref.startsWith("evr1_")) return undefined;
  try {
    const raw = Buffer.from(ref.slice("evr1_".length), "base64url");
    if (raw.length < 12 + 16 + 1) return undefined;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", opaqueKey(), iv);
    decipher.setAAD(Buffer.from(organisationId, "utf8"));
    decipher.setAuthTag(tag);
    const id = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    return id.length > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

const TRUST_RANK: Record<TrustLevel, number> = {
  DECLARED: 1,
  EVIDENCED: 2,
  VERIFIED: 3,
  TRACEABLE: 4,
};

export type AttestationStatus = "ON_FILE" | "EVIDENCED" | "VERIFIED" | "EXPIRED";

/**
 * Attestation status follows engine trust, not mere existence.
 * Not-expired bytes are ON_FILE until a linked claim is EVIDENCED or VERIFIED/TRACEABLE.
 */
export function attestationStatus(args: { expired: boolean; trustLevel?: TrustLevel }): AttestationStatus {
  if (args.expired) return "EXPIRED";
  if (!args.trustLevel || args.trustLevel === "DECLARED") return "ON_FILE";
  if (args.trustLevel === "EVIDENCED") return "EVIDENCED";
  return "VERIFIED";
}

export function highestTrustForEvidence(state: EngineState, evidenceId: string): TrustLevel | undefined {
  let best: TrustLevel | undefined;
  for (const claim of state.claims) {
    if (claim.evidenceId !== evidenceId) continue;
    if (!best || TRUST_RANK[claim.trustLevel] > TRUST_RANK[best]) best = claim.trustLevel;
  }
  return best;
}

export function evaluateActorDisclosure(state: EngineState, actorId: string | undefined): DisclosureDecision {
  if (!actorId) {
    return decision("NONE", { reason: "no-actor" });
  }
  if (isConfidentialActor(state, actorId)) {
    return decision("ATTESTATION_ONLY", {
      reason: "confidential-upstream",
      canRevealValidity: true,
    });
  }
  return decision("FULL", {
    reason: "visible-actor",
    canRevealIdentity: true,
    canRevealOwner: true,
  });
}

export function evaluateEvidenceDisclosure(args: {
  state: EngineState;
  evidence: EvidenceRecord;
  capabilities: Capability[];
  organisationId: string;
}): DisclosureDecision {
  const { evidence, capabilities } = args;
  const ownerConfidential = isConfidentialActor(args.state, evidence.ownerActorId);
  const mode = evidence.disclosureMode;

  if (mode === "VERIFICATION_ONLY") {
    return decision("ATTESTATION_ONLY", {
      reason: "verification-only-disclosure",
      canRevealValidity: true,
    });
  }

  if (mode === "PROTECTED_SOURCE" || mode === "CANNOT_DISCLOSE") {
    return decision("ATTESTATION_ONLY", {
      reason: "protected-source-disclosure",
      canRevealValidity: true,
    });
  }

  if (mode === "SHARE_SOURCE") {
    if (ownerConfidential) {
      return decision("ATTESTATION_ONLY", {
        reason: "protected-upstream-evidence",
        canRevealValidity: true,
      });
    }
    if (!capabilities.includes("evidence:read_private") && evidence.visibility !== "public") {
      return decision("ATTESTATION_ONLY", {
        reason: "share-source-without-capability",
        canRevealValidity: true,
      });
    }
    if (!capabilities.includes("evidence:read")) {
      return decision("NONE", { reason: "no-evidence-read" });
    }
    return decision("FULL", {
      reason: "share-source-authorized",
      canRevealEvidenceId: false,
      canRevealFilename: true,
      canRevealIssuer: true,
      canRevealValue: true,
      canRevealValidity: true,
      canRevealOwner: true,
      canRevealHash: true,
      canIssueSignedUrl: capabilities.includes("evidence:export") || capabilities.includes("evidence:read_private"),
    });
  }

  if (evidence.visibility === "protected" || ownerConfidential) {
    return decision("ATTESTATION_ONLY", {
      reason: ownerConfidential ? "protected-upstream-evidence" : "protected-evidence",
      canRevealValidity: true,
    });
  }

  if (evidence.visibility === "private") {
    if (!capabilities.includes("evidence:read_private")) {
      return decision("ATTESTATION_ONLY", {
        reason: "private-evidence-without-capability",
        canRevealValidity: true,
      });
    }
    if (!capabilities.includes("evidence:read")) {
      return decision("NONE", { reason: "no-evidence-read" });
    }
    return decision("FULL", {
      reason: "private-evidence-authorized",
      canRevealEvidenceId: false,
      canRevealFilename: true,
      canRevealIssuer: true,
      canRevealValue: true,
      canRevealValidity: true,
      canRevealOwner: true,
      canRevealHash: true,
      canIssueSignedUrl: capabilities.includes("evidence:export") || capabilities.includes("evidence:read_private"),
    });
  }

  if (!capabilities.includes("evidence:read") && !capabilities.includes("evidence:read_private")) {
    return decision("ATTESTATION_ONLY", {
      reason: "public-evidence-without-read",
      canRevealValidity: true,
    });
  }

  return decision("FULL", {
    reason: "public-evidence",
    canRevealEvidenceId: false,
    canRevealFilename: true,
    canRevealIssuer: true,
    canRevealValue: true,
    canRevealValidity: true,
    canRevealOwner: true,
    canRevealHash: true,
    canIssueSignedUrl: capabilities.includes("evidence:read"),
  });
}

export function evaluateAuditDisclosure(view: "internal" | "tenant" | "portal"): DisclosureDecision {
  if (view === "internal") {
    return decision("FULL", {
      reason: "internal-security-audit",
      canRevealIdentity: true,
      canRevealEvidenceId: true,
      canRevealFilename: true,
      canRevealIssuer: true,
      canRevealValue: true,
      canRevealValidity: true,
      canRevealOwner: true,
      canRevealHash: true,
    });
  }
  if (view === "portal") {
    return decision("METADATA_ONLY", { reason: "supplier-portal-audit", canRevealValidity: true });
  }
  return decision("VALUE_ONLY", { reason: "tenant-audit", canRevealValidity: true, canRevealValue: true });
}

export type EvidenceProjection =
  | {
      type: "EVIDENCE_RECORD";
      evidenceVisible: true;
      opaqueRef: string;
      filename?: string;
      issuer?: string;
      status: string;
      expired: boolean;
      validUntil?: string;
      signedUrl?: string;
      signedExpiresAt?: string;
    }
  | {
      type: "EVIDENCE_ATTESTATION";
      evidenceVisible: false;
      status: AttestationStatus;
      validUntil?: string;
    };

export function projectEvidenceRecord(
  organisationId: string,
  evidence: EvidenceRecord,
  decision: DisclosureDecision,
  trustLevel?: TrustLevel
): EvidenceProjection | undefined {
  if (decision.level === "NONE") return undefined;

  if (
    decision.level === "ATTESTATION_ONLY" ||
    decision.level === "EXISTENCE_ONLY" ||
    !decision.canRevealFilename
  ) {
    return {
      type: "EVIDENCE_ATTESTATION",
      evidenceVisible: false,
      status: attestationStatus({ expired: evidence.expired, trustLevel }),
      validUntil: decision.canRevealValidity ? evidence.validUntil : undefined,
    };
  }

  return {
    type: "EVIDENCE_RECORD",
    evidenceVisible: true,
    opaqueRef: opaqueEvidenceRef(organisationId, evidence.id),
    filename: decision.canRevealFilename ? evidence.filename : undefined,
    issuer: decision.canRevealIssuer ? evidence.issuer : undefined,
    status: evidence.expired ? "expired" : "on_file",
    expired: evidence.expired,
    validUntil: decision.canRevealValidity ? evidence.validUntil : undefined,
  };
}

export function principalCapabilities(principal: { capabilities?: Capability[] }): Capability[] {
  return principal.capabilities ?? [];
}

export function hasEvidenceByteAccess(principal: Principal, decision: DisclosureDecision): boolean {
  return decision.canIssueSignedUrl && principal.capabilities.includes("evidence:read");
}

export function confidentialSecrets(state: EngineState): string[] {
  const secrets: string[] = [];
  for (const actor of state.actors) {
    if (!isConfidentialActor(state, actor.id)) continue;
    pushSecret(secrets, actor.id);
    pushSecret(secrets, actor.name);
    pushSecret(secrets, actor.legalName);
    for (const alias of aliasesOf(actor)) pushSecret(secrets, alias);
  }
  for (const evidence of state.evidence) {
    const decision = evaluateEvidenceDisclosure({
      state,
      evidence,
      capabilities: [],
      organisationId: state.tenant.id,
    });
    if (decision.canRevealFilename) continue;
    pushSecret(secrets, evidence.id);
    pushSecret(secrets, evidence.filename);
    pushSecret(secrets, evidence.ownerActorId);
    if (evidence.storageObjectId) pushSecret(secrets, evidence.storageObjectId);
    if (!decision.canRevealIssuer) pushSecret(secrets, evidence.issuer);
    if (!decision.canRevealHash) pushSecret(secrets, evidence.sha256);
  }
  for (const rel of state.relationships) {
    if (rel.confidentialUpstream) pushSecret(secrets, rel.id);
  }
  return secrets;
}

function aliasesOf(actor: Actor): string[] {
  const extra = (actor as Actor & { aliases?: string[] }).aliases;
  return extra ?? [];
}

function pushSecret(list: string[], value: string | undefined) {
  if (value && value.length >= 3 && !list.includes(value)) list.push(value);
}

function decision(
  level: DisclosureLevel,
  flags: Partial<DisclosureDecision> & { reason: string }
): DisclosureDecision {
  return {
    level,
    canRevealIdentity: false,
    canRevealEvidenceId: false,
    canRevealFilename: false,
    canRevealIssuer: false,
    canRevealValue: false,
    canRevealValidity: false,
    canRevealOwner: false,
    canRevealHash: false,
    canRevealStorageKey: false,
    canIssueSignedUrl: false,
    policyVersion: DISCLOSURE_POLICY_VERSION,
    ...flags,
  };
}
