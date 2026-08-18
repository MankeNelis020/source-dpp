import type { Command } from "@/domain/source/types";
import type { Capability, PortalCommand, PortalPrincipal, Principal, Role } from "./types";
import { SourceError } from "./types";

export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  OWNER: [
    "claim:read",
    "claim:approve",
    "evidence:read",
    "evidence:read_private",
    "evidence:export",
    "supplier:request",
    "supplier:manage_contact",
    "permission:request",
    "permission:grant",
    "permission:revoke",
    "identity:review",
    "identity:merge",
    "identity:split",
    "integration:manage",
    "organisation:manage",
    "catalogue:write",
    "import:manage",
    "case:read",
    "case:resolve",
    "audit:read_internal",
  ],
  ADMIN: [
    "claim:read",
    "claim:approve",
    "evidence:read",
    "evidence:read_private",
    "evidence:export",
    "supplier:request",
    "supplier:manage_contact",
    "permission:request",
    "permission:grant",
    "permission:revoke",
    "identity:review",
    "identity:merge",
    "identity:split",
    "organisation:manage",
    "catalogue:write",
    "import:manage",
    "case:read",
    "case:resolve",
    "audit:read_internal",
  ],
  COMPLIANCE_MANAGER: [
    "claim:read",
    "claim:approve",
    "evidence:read",
    "evidence:read_private",
    "permission:request",
    "permission:grant",
    "supplier:request",
    "case:read",
    "case:resolve",
    "identity:review",
    "catalogue:write",
    "import:manage",
  ],
  PROCUREMENT_MANAGER: [
    "claim:read",
    "evidence:read",
    "supplier:request",
    "supplier:manage_contact",
    "case:read",
    "case:resolve",
  ],
  DATA_STEWARD: [
    "claim:read",
    "evidence:read",
    "catalogue:write",
    "import:manage",
    "identity:review",
    "case:read",
  ],
  REVIEWER: ["claim:read", "evidence:read", "identity:review", "case:read", "case:resolve"],
  AUDITOR: ["claim:read", "evidence:read", "case:read", "audit:read_internal"],
};

const COMMAND_CAPABILITY: Partial<Record<Command["type"], Capability>> = {
  OPEN_REQUIREMENT: "catalogue:write",
  SEND_REQUEST: "supplier:request",
  TICK_NO_RESPONSE: "supplier:request",
  SEND_REMINDER: "supplier:request",
  ESCALATE: "supplier:request",
  CHANGE_CONTACT: "supplier:manage_contact",
  MARK_BOUNCE: "supplier:manage_contact",
  MARK_WRONG_CONTACT: "supplier:manage_contact",
  MARK_UNKNOWN: "case:resolve",
  FORWARD_UPSTREAM: "supplier:request",
  DECLINE: "case:resolve",
  SUBMIT_RESPONSE: "case:resolve",
  GRANT_PERMISSION: "permission:grant",
  DENY_PERMISSION: "permission:grant",
  REVOKE_PERMISSION: "permission:revoke",
  EXPIRE_EVIDENCE: "evidence:read_private",
  RESOLVE_CONFLICT: "claim:approve",
  CONFIRM_IDENTITY: "identity:review",
  CLOSE_UNRESOLVED: "case:resolve",
  ASSIGN_COLLEAGUE: "supplier:manage_contact",
  COMPLETE_TASK: "case:resolve",
  ADD_SUBJECT: "catalogue:write",
  CORRECT_SUBJECT_RELATIONSHIP: "catalogue:write",
  REMOVE_SUBJECT_RELATIONSHIP: "catalogue:write",
  MARK_SUBJECT_UNKNOWN: "catalogue:write",
};

const PORTAL_COMMAND_MAP: Partial<Record<Command["type"], PortalCommand>> = {
  SUBMIT_RESPONSE: "SUBMIT_RESPONSE",
  MARK_UNKNOWN: "MARK_UNKNOWN",
  FORWARD_UPSTREAM: "FORWARD_UPSTREAM",
  ASSIGN_COLLEAGUE: "ASSIGN_COLLEAGUE",
  DECLINE: "DECLINE",
  MARK_WRONG_CONTACT: "MARK_WRONG_CONTACT",
};

export function authorizeUserCommand(principal: Principal, command: Command) {
  const needed = COMMAND_CAPABILITY[command.type];
  if (!needed) throw new SourceError("FORBIDDEN", "Unknown command.", 403);
  if (!principal.capabilities.includes(needed)) {
    throw new SourceError("FORBIDDEN", "You cannot perform this action.", 403);
  }
}

export function authorizePortalCommand(principal: PortalPrincipal, command: Command) {
  const mapped = PORTAL_COMMAND_MAP[command.type];
  if (!mapped || !principal.allowedCommands.includes(mapped)) {
    throw new SourceError("FORBIDDEN", "This portal grant cannot perform that action.", 403);
  }
  const caseId = "caseId" in command ? command.caseId : undefined;
  if (caseId && !principal.allowedCaseIds.includes(caseId)) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
}

export function assertOrganisation(principal: Principal, organisationId: string) {
  if (principal.organisationId !== organisationId) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
}

export function hasCapability(principal: Principal, capability: Capability) {
  return principal.capabilities.includes(capability);
}
