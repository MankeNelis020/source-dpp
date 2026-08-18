import { evaluateReuse } from "@/domain/source/reuse";
import type { InformationRequirement } from "@/domain/source/types";
import type { PersistencePort } from "@/infrastructure/database/ports";
import type { Principal } from "./types";

export type NetworkReuseOutcome =
  | "READY"
  | "AUTHORIZATION_REQUIRED"
  | "VERIFICATION_ONLY_AVAILABLE"
  | "NO_MATCH";

export interface NetworkReuseResult {
  outcome: NetworkReuseOutcome;
  explanation: string;
}

/**
 * Cross-tenant reuse must go through this service.
 * Never SELECT tenant-private claims from ordinary tenant query paths.
 * Output never includes source tenant, other customers' cases, or private evidence.
 */
export async function findReusableClaimsForRequirement(
  store: PersistencePort,
  principal: Principal,
  requirement: Pick<InformationRequirement, "subjectId" | "propertyId" | "requiredTrustLevel" | "purpose">,
  now = new Date()
): Promise<NetworkReuseResult> {
  const local = await store.loadEngine(principal.organisationId);
  const localClaim = local.claims.find(
    (claim) => claim.subjectId === requirement.subjectId && claim.propertyId === requirement.propertyId
  );
  if (localClaim) {
    const evidence = localClaim.evidenceId ? local.evidence.find((item) => item.id === localClaim.evidenceId) : undefined;
    const permission = local.permissions.find((item) => item.claimId === localClaim.id);
    const outcome = evaluateReuse({
      requirement,
      identityMatched: true,
      claim: localClaim,
      evidence,
      permission,
      now,
    });
    const mapped = mapReuse(outcome);
    if (mapped.outcome !== "NO_MATCH") return mapped;
  }

  const candidates = await store.findShareableTrustCandidates({
    requesterOrganisationId: principal.organisationId,
    subjectId: requirement.subjectId,
    propertyId: requirement.propertyId,
  });

  let best: NetworkReuseOutcome = "NO_MATCH";
  for (const candidate of candidates) {
    const outcome = evaluateReuse({
      requirement,
      identityMatched: candidate.identityMatched,
      claim: {
        id: "network",
        requirementId: "network",
        propertyId: requirement.propertyId,
        subjectId: requirement.subjectId,
        declaredByActorId: "network",
        trustLevel: candidate.trustLevel,
        permissionState: candidate.permissionState,
        purpose: candidate.purpose,
        identityConfidence: 0,
        ready: false,
        validUntil: candidate.validUntil,
        value: "",
        productId: requirement.subjectId,
      },
      evidence: candidate.expired
        ? {
            id: "network",
            filename: "hidden",
            sha256: "00",
            issuer: "hidden",
            ownerActorId: "network",
            expired: true,
            validUntil: candidate.validUntil,
            scope: { kind: "product", label: "hidden" },
            visibility: "protected",
            linkedClaimIds: [],
          }
        : undefined,
      permission: {
        id: "network",
        claimId: "network",
        granteeActorId: principal.organisationId,
        purpose: candidate.purpose,
        state: candidate.permissionState,
        visibility: candidate.visibility ?? "verification_only",
        createdAt: now.toISOString(),
      },
      now,
    });
    const mapped = mapReuse(outcome);
    if (rank(mapped.outcome) > rank(best)) best = mapped.outcome;
  }

  return mapReuse(best === "NO_MATCH" ? "NONE" : best);
}

function rank(outcome: NetworkReuseOutcome): number {
  if (outcome === "READY") return 3;
  if (outcome === "VERIFICATION_ONLY_AVAILABLE") return 2;
  if (outcome === "AUTHORIZATION_REQUIRED") return 1;
  return 0;
}

function mapReuse(outcome: string): NetworkReuseResult {
  if (outcome === "READY") {
    return { outcome: "READY", explanation: "A compatible trusted object can resolve this requirement." };
  }
  if (outcome === "AUTHORIZATION_REQUIRED") {
    return {
      outcome: "AUTHORIZATION_REQUIRED",
      explanation: "A compatible object exists. Permission must be evaluated before reuse.",
    };
  }
  if (outcome === "VERIFICATION_ONLY_AVAILABLE") {
    return {
      outcome: "VERIFICATION_ONLY_AVAILABLE",
      explanation: "Verification is available without exposing source private context.",
    };
  }
  return { outcome: "NO_MATCH", explanation: "No reusable trusted object is available." };
}
