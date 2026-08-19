/**
 * Explicit consent for future evidence reuse.
 *
 * Discovery (this evidence may be relevant) is not permission to apply it.
 * ASK_FOR_REUSE creates a scope-specific consent request. Approval does not
 * change the evidence's global reusePolicy and never widens disclosure.
 *
 * Defaults:
 * - New portal submissions: ASK_FOR_REUSE (preferred), unless the accepted
 *   terms ceiling is stricter.
 * - Unspecified / legacy evidence: NO_REUSE (fail closed) via effectiveReusePolicy.
 * - Exact same-subject claims without reusePolicy keep working through evaluateReuse;
 *   fail-closed NO_REUSE applies to cross-product discovery only.
 */
import { evidenceScopeApplies } from "./propagation";
import { effectiveDisclosureMode } from "./evidence-policy";
import type {
  ClaimRecord,
  DisclosureMode,
  EngineState,
  EvidenceRecord,
  EvidenceReuseConsent,
  EvidenceReusePolicy,
  InformationRequirement,
  PermissionGrant,
  Purpose,
} from "./types";

export function effectiveReusePolicy(evidence?: Pick<EvidenceRecord, "reusePolicy">): EvidenceReusePolicy {
  return evidence?.reusePolicy ?? "NO_REUSE";
}

export function reuseConsentKey(args: {
  evidenceId: string;
  caseId: string;
  requirementId: string;
  organisationId: string;
  purpose: Purpose;
}): string {
  return [args.evidenceId, args.caseId, args.requirementId, args.organisationId, args.purpose].join(":");
}

export function purposesCompatible(left: Purpose, right: Purpose): boolean {
  return left === right;
}

export function canAutomaticallyReuse(args: {
  evidence: EvidenceRecord;
  claim: ClaimRecord;
  permission?: PermissionGrant;
  requirement: Pick<InformationRequirement, "subjectId" | "propertyId" | "purpose">;
  requestingOrganisationId: string;
  supplierId?: string;
  now: Date;
}): boolean {
  const policy = effectiveReusePolicy(args.evidence);
  if (policy !== "REUSE_WITHIN_REQUESTING_ORGANISATION" && policy !== "BROADER_REUSE") return false;
  if (args.evidence.expired || args.evidence.supersededByEvidenceId) return false;
  if (args.permission?.state === "REVOKED" || args.permission?.revokedAt) return false;
  if (args.claim.declaredByActorId && args.supplierId && args.claim.declaredByActorId !== args.supplierId) return false;
  if (args.permission?.granteeActorId && args.permission.granteeActorId !== args.requestingOrganisationId) return false;
  if (!purposesCompatible(args.claim.purpose, args.requirement.purpose)) return false;
  if (args.claim.propertyId !== args.requirement.propertyId) return false;
  const expired =
    (args.claim.validUntil ? new Date(args.claim.validUntil) < args.now : false) ||
    (args.evidence.validUntil ? new Date(args.evidence.validUntil) < args.now : false);
  if (expired) return false;
  if (args.evidence.scope.kind !== "company" && !evidenceScopeApplies(args.evidence, args.requirement.subjectId)) {
    return false;
  }
  return true;
}

export interface EvidenceReuseDiscovery {
  evidence: EvidenceRecord;
  claim: ClaimRecord;
  permission?: PermissionGrant;
  mode: "auto" | "consent";
}

/**
 * Recognition that previously supplied evidence may be relevant.
 * Does not grant permission to apply it.
 */
export function discoverReusableEvidence(args: {
  state: EngineState;
  requirement: InformationRequirement;
  supplierId?: string;
  now: Date;
}): EvidenceReuseDiscovery | undefined {
  if (!args.supplierId) return undefined;
  const matches: EvidenceReuseDiscovery[] = [];
  for (const claim of args.state.claims) {
    if (claim.propertyId !== args.requirement.propertyId) continue;
    if (claim.subjectId === args.requirement.subjectId) continue;
    if (claim.declaredByActorId !== args.supplierId) continue;
    if (!claim.evidenceId) continue;
    const evidence = args.state.evidence.find((item) => item.id === claim.evidenceId);
    if (!evidence || evidence.expired || evidence.supersededByEvidenceId) continue;
    const policy = effectiveReusePolicy(evidence);
    if (policy === "NO_REUSE") continue;
    const permission = args.state.permissions.find((item) => item.claimId === claim.id);
    const existingConsent = args.state.reuseConsents.find(
      (row) =>
        row.evidenceId === evidence.id &&
        row.requirementId === args.requirement.id &&
        row.requestingOrganisationId === args.state.tenant.id &&
        row.purpose === args.requirement.purpose
    );
    if (existingConsent?.status === "DECLINED") continue;
    if (existingConsent?.status === "APPROVED") {
      matches.push({ evidence, claim, permission, mode: "auto" });
      continue;
    }
    if (policy === "ASK_FOR_REUSE") {
      matches.push({ evidence, claim, permission, mode: "consent" });
      continue;
    }
    if (
      canAutomaticallyReuse({
        evidence,
        claim,
        permission,
        requirement: args.requirement,
        requestingOrganisationId: args.state.tenant.id,
        supplierId: args.supplierId,
        now: args.now,
      })
    ) {
      matches.push({ evidence, claim, permission, mode: "auto" });
    } else {
      matches.push({ evidence, claim, permission, mode: "consent" });
    }
  }
  return matches.find((item) => item.mode === "auto") ?? matches[0];
}

export function findReuseConsent(
  state: EngineState,
  args: { consentId?: string; caseId?: string; evidenceId?: string; key?: string }
): EvidenceReuseConsent | undefined {
  if (args.consentId) return state.reuseConsents.find((row) => row.id === args.consentId);
  if (args.key) return state.reuseConsents.find((row) => row.key === args.key);
  return state.reuseConsents.find(
    (row) =>
      row.caseId === args.caseId &&
      (!args.evidenceId || row.evidenceId === args.evidenceId) &&
      (row.status === "PENDING" || row.status === "APPROVED" || row.status === "DECLINED")
  );
}

export function disclosureNotBroadened(from?: DisclosureMode, to?: DisclosureMode): boolean {
  const rank: Record<DisclosureMode, number> = {
    CANNOT_DISCLOSE: 0,
    VERIFICATION_ONLY: 1,
    PROTECTED_SOURCE: 2,
    SHARE_SOURCE: 3,
  };
  if (!from || !to) return true;
  return rank[to] <= rank[from];
}

export function inheritedDisclosureMode(evidence: EvidenceRecord): DisclosureMode {
  return evidence.disclosureMode ?? effectiveDisclosureMode(evidence);
}
