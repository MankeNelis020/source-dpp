import type {
  LegacyVisibility,
  PermissionDecision,
  PermissionGrant,
  PermissionState,
  Purpose,
  VisibilityPolicy,
} from "./types";

export interface PermissionEvaluationInput {
  storedState: PermissionState;
  visibility?: VisibilityPolicy | LegacyVisibility;
  permissionRequired: boolean;
  requestingOrganisationId: string;
  ownerOrganisationId?: string;
  granteeActorId?: string;
  purpose: Purpose;
  grantPurpose?: Purpose;
  now: Date;
  validFrom?: string;
  validUntil?: string;
  revokedAt?: string;
}

export function normalizeVisibility(value?: VisibilityPolicy | LegacyVisibility): VisibilityPolicy {
  if (!value) return "PRIVATE";
  if (value === "value") return "VALUE_ONLY";
  if (value === "evidence_hidden") return "EVIDENCE_HIDDEN";
  if (value === "upstream_hidden") return "UPSTREAM_IDENTITY_HIDDEN";
  if (value === "verification_only") return "VERIFICATION_ONLY";
  if (value === "restricted") return "REQUEST_ACCESS";
  return value;
}

/**
 * Stored permission is not evaluated permission.
 * RESTRICTED / REQUEST_ACCESS never auto-pass.
 */
export function evaluatePermission(input: PermissionEvaluationInput): PermissionDecision {
  if (!input.permissionRequired) return "ALLOW";
  if (input.revokedAt || input.storedState === "REVOKED" || input.storedState === "DENIED") return "DENY";
  if (input.storedState === "EXPIRED") return "DENY";

  if (input.validUntil && new Date(input.validUntil) < input.now) return "DENY";
  if (input.validFrom && new Date(input.validFrom) > input.now) return "AUTHORIZATION_REQUIRED";

  if (input.grantPurpose && input.grantPurpose !== input.purpose) return "AUTHORIZATION_REQUIRED";

  const visibility = normalizeVisibility(input.visibility);
  const audienceOk =
    !input.granteeActorId ||
    input.granteeActorId === input.requestingOrganisationId ||
    visibility === "PUBLIC";

  if (input.storedState === "GRANTED" || input.storedState === "NOT_REQUIRED") {
    if (visibility === "PRIVATE" && input.ownerOrganisationId !== input.requestingOrganisationId) {
      return "DENY";
    }
    if (visibility === "REQUEST_ACCESS") return "AUTHORIZATION_REQUIRED";
    if (visibility === "VERIFICATION_ONLY") return "ALLOW";
    if (!audienceOk) return "AUTHORIZATION_REQUIRED";
    return "ALLOW";
  }

  if (input.storedState === "RESTRICTED") return "AUTHORIZATION_REQUIRED";
  if (
    input.storedState === "REQUEST_REQUIRED" ||
    input.storedState === "REQUESTED" ||
    input.storedState === "UNKNOWN"
  ) {
    return "AUTHORIZATION_REQUIRED";
  }

  return "AUTHORIZATION_REQUIRED";
}

export function decisionFromGrant(args: {
  grant?: PermissionGrant;
  fallbackState: PermissionState;
  permissionRequired: boolean;
  requestingOrganisationId: string;
  purpose: Purpose;
  now: Date;
}): PermissionDecision {
  return evaluatePermission({
    storedState: args.grant?.state ?? args.fallbackState,
    visibility: args.grant?.visibility,
    permissionRequired: args.permissionRequired,
    requestingOrganisationId: args.requestingOrganisationId,
    granteeActorId: args.grant?.granteeActorId,
    purpose: args.purpose,
    grantPurpose: args.grant?.purpose,
    now: args.now,
    validFrom: args.grant?.validFrom,
    validUntil: args.grant?.validUntil,
    revokedAt: args.grant?.revokedAt,
  });
}

export function permissionGatePass(decision: PermissionDecision): boolean {
  return decision === "ALLOW";
}
