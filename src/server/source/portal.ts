import { hashToken } from "@/infrastructure/crypto/tokens";
import type { PersistencePort } from "@/infrastructure/database/ports";
import type { PortalPrincipal } from "./types";
import { SourceError } from "./types";

export async function resolvePortalPrincipal(store: PersistencePort, token: string, now = new Date()): Promise<PortalPrincipal> {
  if (!token || token.length < 3) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
  const grant = await store.findPortalGrantByTokenHash(hashToken(token));
  if (!grant) throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  if (grant.revokedAt) throw new SourceError("REVOKED", "This link is no longer valid.", 401);
  if (new Date(grant.expiresAt) <= now) {
    const org = await store.getOrganisation(grant.tenantContextId);
    throw new SourceError(
      "EXPIRED",
      `This request link has expired. Please ask ${org?.name ?? "the manufacturer"} to send a new link.`,
      401
    );
  }
  return {
    kind: "supplier_portal",
    grantId: grant.id,
    actorId: grant.actorId,
    organisationId: grant.tenantContextId,
    allowedCaseIds: grant.allowedCaseIds,
    allowedRequirementIds: grant.allowedRequirementIds,
    allowedCommands: grant.allowedCommands,
  };
}

export async function issuePortalGrant(
  store: PersistencePort,
  input: {
    token: string;
    actorId: string;
    organisationId: string;
    allowedCaseIds: string[];
    allowedRequirementIds: string[];
    expiresAt: string;
  }
) {
  const grant = {
    id: store.nextId("grant"),
    tokenHash: hashToken(input.token),
    actorId: input.actorId,
    tenantContextId: input.organisationId,
    allowedCaseIds: input.allowedCaseIds,
    allowedRequirementIds: input.allowedRequirementIds,
    allowedCommands: [
      "VIEW_REQUIREMENT",
      "SUBMIT_RESPONSE",
      "UPLOAD_EVIDENCE",
      "FORWARD_UPSTREAM",
      "ASSIGN_COLLEAGUE",
      "DECLINE",
      "REQUEST_CLARIFICATION",
      "MARK_UNKNOWN",
      "MARK_WRONG_CONTACT",
      "ACCEPT_EVIDENCE_DISCLOSURE",
    ] as const,
    expiresAt: input.expiresAt,
    createdAt: new Date().toISOString(),
  };
  await store.savePortalGrant({ ...grant, allowedCommands: [...grant.allowedCommands] });
  return grant;
}
