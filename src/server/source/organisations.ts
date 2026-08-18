import { emptyState } from "@/domain/source/engine";
import type { PersistencePort } from "@/infrastructure/database/ports";
import type { AuthIdentity } from "@/infrastructure/auth/identity";
import { generateBearerToken, hashToken, hashesEqual } from "@/infrastructure/crypto/tokens";
import { ROLE_CAPABILITIES, hasCapability } from "./authorization";
import { structuredCommandAudit } from "./audit";
import type {
  Membership,
  MembershipStatus,
  Organisation,
  OrganisationInvitation,
  Principal,
  Role,
  UserRecord,
} from "./types";
import { SourceError } from "./types";

export const INVITATION_TTL_DAYS_DEFAULT = 7;

export const INVITABLE_ROLES: Role[] = [
  "ADMIN",
  "MEMBER",
  "COMPLIANCE_MANAGER",
  "PROCUREMENT_MANAGER",
  "DATA_STEWARD",
  "REVIEWER",
  "AUDITOR",
];

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function slugifyOrganisationName(name: string): string {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return base || "organisation";
}

export async function ensureSourceProfile(store: PersistencePort, identity: AuthIdentity): Promise<UserRecord> {
  const existing = await store.getUserById(identity.userId);
  if (existing) {
    const email = normalizeEmail(identity.email);
    if (existing.email !== email) {
      const next = { ...existing, email };
      await store.saveUser(next);
      return next;
    }
    return existing;
  }
  const profile: UserRecord = {
    id: identity.userId,
    email: normalizeEmail(identity.email),
    displayName: identity.displayName?.trim() || identity.email.split("@")[0] || "Member",
  };
  await store.saveUser(profile);
  await store.appendAudit({
    id: store.nextId("aud"),
    organisationId: undefined,
    principalId: identity.userId,
    action: "USER_PROFILE_CREATED",
    resourceType: "User",
    resourceId: identity.userId,
    result: "success",
    publicContext: { emailDomain: profile.email.split("@")[1] },
    createdAt: new Date().toISOString(),
  });
  return profile;
}

export async function resolveOrganisationPrincipal(
  store: PersistencePort,
  identity: AuthIdentity,
  requestedOrganisationId?: string
): Promise<Principal> {
  if (!identity.emailVerified) {
    throw new SourceError("UNAUTHENTICATED", "Verify your email to continue.", 401);
  }
  const profile = await ensureSourceProfile(store, identity);
  const memberships = (await store.listMemberships(identity.userId)).filter((row) => row.status !== "SUSPENDED");
  if (!memberships.length) {
    throw new SourceError("UNAUTHENTICATED", "Create an organisation to continue.", 401);
  }
  if (requestedOrganisationId) {
    const selected = memberships.find((row) => row.organisationId === requestedOrganisationId);
    if (!selected) {
      throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
    }
    return toPrincipal(profile, selected, identity.authenticationMethod);
  }
  if (memberships.length === 1) {
    return toPrincipal(profile, memberships[0], identity.authenticationMethod);
  }
  throw new SourceError("VALIDATION", "Select an organisation.", 400);
}

export function toPrincipal(
  profile: UserRecord,
  membership: Membership,
  authenticationMethod: AuthIdentity["authenticationMethod"]
): Principal {
  return {
    kind: "user",
    userId: profile.id,
    organisationId: membership.organisationId,
    membershipId: membership.id,
    roles: [membership.role],
    capabilities: membership.capabilities.length ? membership.capabilities : ROLE_CAPABILITIES[membership.role],
    email: profile.email,
    authenticationMethod,
  };
}

export async function createOrganisationForIdentity(args: {
  store: PersistencePort;
  identity: AuthIdentity;
  name: string;
  country?: string;
  website?: string;
  idempotencyKey: string;
  now?: Date;
}): Promise<{ organisation: Organisation; principal: Principal; alreadyProcessed: boolean }> {
  if (!args.identity.emailVerified) {
    throw new SourceError("UNAUTHENTICATED", "Verify your email to continue.", 401);
  }
  const now = args.now ?? new Date();
  const replay = await args.store.findIdentityCommand(args.identity.userId, args.idempotencyKey);
  if (replay?.organisationId) {
    const organisation = await args.store.getOrganisation(replay.organisationId);
    const principal = await resolveOrganisationPrincipal(args.store, args.identity, replay.organisationId);
    if (!organisation) throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
    return { organisation, principal, alreadyProcessed: true };
  }

  return args.store.transaction(async (tx) => {
    await tx.saveIdentityCommand({
      userId: args.identity.userId,
      idempotencyKey: args.idempotencyKey,
      commandType: "CREATE_ORGANISATION",
      result: { status: "pending" },
      processedAt: now.toISOString(),
    });
    const inner = await tx.findIdentityCommand(args.identity.userId, args.idempotencyKey);
    if (inner?.organisationId) {
      const organisation = await tx.getOrganisation(inner.organisationId);
      const principal = await resolveOrganisationPrincipal(tx, args.identity, inner.organisationId);
      if (!organisation) throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
      return { organisation, principal, alreadyProcessed: true };
    }

    const profile = await ensureSourceProfile(tx, args.identity);
    const organisationId = tx.nextId("org");
    const slug = await uniqueSlug(tx, slugifyOrganisationName(args.name));
    const organisation: Organisation = {
      id: organisationId,
      name: args.name.trim(),
      slug,
      country: args.country?.trim() || undefined,
      website: args.website?.trim() || undefined,
      createdBy: profile.id,
      createdAt: now.toISOString(),
    };
    await tx.saveOrganisation(organisation);
    const membership: Membership = {
      id: tx.nextId("mem"),
      userId: profile.id,
      organisationId,
      role: "OWNER",
      capabilities: [...ROLE_CAPABILITIES.OWNER],
      status: "ACTIVE",
      createdBy: profile.id,
      createdAt: now.toISOString(),
    };
    await tx.saveMembership(membership);
    await tx.saveEngine(organisationId, emptyState({ id: organisationId, name: organisation.name }));
    await tx.appendAudit(
      structuredCommandAudit({
        id: tx.nextId("aud"),
        organisationId,
        principalId: profile.id,
        action: "ORGANISATION_CREATED",
        commandId: args.idempotencyKey,
        result: "success",
        eventTypes: ["ORGANISATION_CREATED", "MEMBERSHIP_CREATED"],
        createdAt: now.toISOString(),
      })
    );
    await tx.saveIdentityCommand({
      userId: profile.id,
      idempotencyKey: args.idempotencyKey,
      commandType: "CREATE_ORGANISATION",
      organisationId,
      result: { organisationId },
      processedAt: now.toISOString(),
    });
    return {
      organisation,
      principal: toPrincipal(profile, membership, args.identity.authenticationMethod),
      alreadyProcessed: false,
    };
  });
}

export async function inviteColleague(args: {
  store: PersistencePort;
  principal: Principal;
  email: string;
  role: Role;
  ttlDays?: number;
  now?: Date;
  exposeInviteUrl?: boolean;
}): Promise<{ invitation: OrganisationInvitation; inviteUrl?: string }> {
  if (!hasCapability(args.principal, "organisation:manage")) {
    throw new SourceError("FORBIDDEN", "You cannot invite colleagues.", 403);
  }
  if (!INVITABLE_ROLES.includes(args.role)) {
    throw new SourceError("VALIDATION", "That role cannot be invited.", 400);
  }
  const email = normalizeEmail(args.email);
  if (!email.includes("@")) throw new SourceError("VALIDATION", "Enter a valid work email.", 400);
  const existingUser = await args.store.getUserByEmail(email);
  if (existingUser) {
    const membership = await args.store.getMembership(existingUser.id, args.principal.organisationId);
    if (membership?.status === "ACTIVE") {
      throw new SourceError("VALIDATION", "This person is already a member.", 400);
    }
  }
  const pending = await args.store.findPendingInvitation(args.principal.organisationId, email);
  const now = args.now ?? new Date();
  if (pending && !pending.revokedAt && !pending.acceptedAt && new Date(pending.expiresAt) > now) {
    await args.store.saveInvitation({ ...pending, revokedAt: now.toISOString() });
  }
  const raw = generateBearerToken();
  const invitation: OrganisationInvitation = {
    id: args.store.nextId("inv"),
    organisationId: args.principal.organisationId,
    emailNormalized: email,
    role: args.role,
    tokenHash: hashToken(raw),
    expiresAt: new Date(now.getTime() + (args.ttlDays ?? INVITATION_TTL_DAYS_DEFAULT) * 24 * 60 * 60 * 1000).toISOString(),
    createdBy: args.principal.userId,
    createdAt: now.toISOString(),
  };
  await args.store.saveInvitation(invitation);
  await args.store.appendAudit(
    structuredCommandAudit({
      id: args.store.nextId("aud"),
      organisationId: args.principal.organisationId,
      principalId: args.principal.userId,
      action: "INVITATION_CREATED",
      commandId: invitation.id,
      result: "success",
      eventTypes: ["INVITATION_CREATED"],
      createdAt: now.toISOString(),
    })
  );
  await args.store.insertOutbox({
    id: args.store.nextId("obx"),
    organisationId: args.principal.organisationId,
    eventType: "organisation.invitation",
    aggregateType: "OrganisationInvitation",
    aggregateId: invitation.id,
    semanticKey: `invite:${args.principal.organisationId}:${email}:${invitation.id}`,
    payload: { to: email, invitationId: invitation.id },
    status: "PENDING",
    availableAt: now.toISOString(),
    attemptCount: 0,
    createdAt: now.toISOString(),
  });
  return {
    invitation,
    inviteUrl: args.exposeInviteUrl ? `/invitations/${raw}` : undefined,
  };
}

export async function revokeInvitation(args: {
  store: PersistencePort;
  principal: Principal;
  invitationId: string;
  now?: Date;
}): Promise<void> {
  if (!hasCapability(args.principal, "organisation:manage")) {
    throw new SourceError("FORBIDDEN", "You cannot revoke invitations.", 403);
  }
  const pending = (await args.store.listInvitations(args.principal.organisationId)).find((row) => row.id === args.invitationId);
  if (!pending || pending.organisationId !== args.principal.organisationId) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
  const now = args.now ?? new Date();
  await args.store.saveInvitation({ ...pending, revokedAt: now.toISOString() });
  await args.store.appendAudit(
    structuredCommandAudit({
      id: args.store.nextId("aud"),
      organisationId: args.principal.organisationId,
      principalId: args.principal.userId,
      action: "INVITATION_REVOKED",
      commandId: pending.id,
      result: "success",
      eventTypes: ["INVITATION_REVOKED"],
      createdAt: now.toISOString(),
    })
  );
}

export async function acceptInvitation(args: {
  store: PersistencePort;
  identity: AuthIdentity;
  rawToken: string;
  now?: Date;
}): Promise<Principal> {
  if (!args.identity.emailVerified) {
    throw new SourceError("UNAUTHENTICATED", "Verify your email to continue.", 401);
  }
  const now = args.now ?? new Date();
  const hash = hashToken(args.rawToken);
  const invitation = await args.store.findInvitationByTokenHash(hash);
  if (!invitation || !hashesEqual(invitation.tokenHash, hash)) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
  if (invitation.revokedAt || new Date(invitation.expiresAt) <= now) {
    throw new SourceError("EXPIRED", "This invitation is no longer valid.", 410);
  }
  if (normalizeEmail(args.identity.email) !== invitation.emailNormalized) {
    throw new SourceError("FORBIDDEN", "This invitation was issued to a different email.", 403);
  }
  if (invitation.acceptedAt) {
    const existing = await args.store.getMembership(args.identity.userId, invitation.organisationId);
    if (existing?.status === "ACTIVE") {
      return resolveOrganisationPrincipal(args.store, args.identity, invitation.organisationId);
    }
    throw new SourceError("EXPIRED", "This invitation is no longer valid.", 410);
  }
  return args.store.transaction(async (tx) => {
    const again = await tx.findInvitationByTokenHash(hash);
    if (!again || again.acceptedAt) {
      const principal = await resolveOrganisationPrincipal(tx, args.identity, invitation.organisationId);
      return principal;
    }
    const existing = await tx.getMembership(args.identity.userId, invitation.organisationId);
    if (existing?.status === "ACTIVE") {
      await tx.saveInvitation({ ...again, acceptedAt: now.toISOString() });
      return resolveOrganisationPrincipal(tx, args.identity, invitation.organisationId);
    }
    const profile = await ensureSourceProfile(tx, args.identity);
    const membership: Membership = existing
      ? { ...existing, status: "ACTIVE", role: invitation.role, capabilities: [...ROLE_CAPABILITIES[invitation.role]] }
      : {
          id: tx.nextId("mem"),
          userId: profile.id,
          organisationId: invitation.organisationId,
          role: invitation.role,
          capabilities: [...ROLE_CAPABILITIES[invitation.role]],
          status: "ACTIVE",
          createdBy: invitation.createdBy,
          createdAt: now.toISOString(),
        };
    await tx.saveMembership(membership);
    await tx.saveInvitation({ ...again, acceptedAt: now.toISOString() });
    await tx.appendAudit(
      structuredCommandAudit({
        id: tx.nextId("aud"),
        organisationId: invitation.organisationId,
        principalId: profile.id,
        action: "INVITATION_ACCEPTED",
        commandId: invitation.id,
        result: "success",
        eventTypes: ["INVITATION_ACCEPTED", "MEMBERSHIP_CREATED"],
        createdAt: now.toISOString(),
      })
    );
    return toPrincipal(profile, membership, args.identity.authenticationMethod);
  });
}

export async function changeMembershipRole(args: {
  store: PersistencePort;
  principal: Principal;
  membershipId: string;
  role: Role;
  now?: Date;
}): Promise<Membership> {
  if (!hasCapability(args.principal, "organisation:manage")) {
    throw new SourceError("FORBIDDEN", "You cannot change roles.", 403);
  }
  const members = await args.store.listOrganisationMemberships(args.principal.organisationId);
  const target = members.find((row) => row.id === args.membershipId);
  if (!target) throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  if (target.role === "OWNER" && args.role !== "OWNER") {
    const owners = await args.store.countActiveOwners(args.principal.organisationId);
    if (owners <= 1) {
      throw new SourceError("VALIDATION", "Transfer ownership before removing the last owner.", 400);
    }
  }
  const next: Membership = {
    ...target,
    role: args.role,
    capabilities: [...ROLE_CAPABILITIES[args.role]],
  };
  await args.store.saveMembership(next);
  await args.store.appendAudit(
    structuredCommandAudit({
      id: args.store.nextId("aud"),
      organisationId: args.principal.organisationId,
      principalId: args.principal.userId,
      action: "MEMBERSHIP_ROLE_CHANGED",
      commandId: target.id,
      result: "success",
      eventTypes: ["MEMBERSHIP_ROLE_CHANGED"],
      createdAt: (args.now ?? new Date()).toISOString(),
    })
  );
  return next;
}

export async function suspendMembership(args: {
  store: PersistencePort;
  principal: Principal;
  membershipId: string;
  now?: Date;
}): Promise<Membership> {
  if (!hasCapability(args.principal, "organisation:manage")) {
    throw new SourceError("FORBIDDEN", "You cannot change membership.", 403);
  }
  const members = await args.store.listOrganisationMemberships(args.principal.organisationId);
  const target = members.find((row) => row.id === args.membershipId);
  if (!target) throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  if (target.role === "OWNER") {
    const owners = await args.store.countActiveOwners(args.principal.organisationId);
    if (owners <= 1) {
      throw new SourceError("VALIDATION", "Transfer ownership before removing the last owner.", 400);
    }
  }
  const next: Membership = { ...target, status: "SUSPENDED" satisfies MembershipStatus };
  await args.store.saveMembership(next);
  await args.store.appendAudit(
    structuredCommandAudit({
      id: args.store.nextId("aud"),
      organisationId: args.principal.organisationId,
      principalId: args.principal.userId,
      action: "MEMBERSHIP_SUSPENDED",
      commandId: target.id,
      result: "success",
      eventTypes: ["MEMBERSHIP_SUSPENDED"],
      createdAt: (args.now ?? new Date()).toISOString(),
    })
  );
  return next;
}

export async function listTeam(store: PersistencePort, principal: Principal) {
  const members = await store.listOrganisationMemberships(principal.organisationId);
  const invitations = await store.listInvitations(principal.organisationId);
  const now = Date.now();
  const people = await Promise.all(
    members.map(async (membership) => {
      const user = await store.getUserById(membership.userId);
      return {
        id: membership.id,
        userId: membership.userId,
        email: user?.email ?? "",
        displayName: user?.displayName ?? "",
        role: membership.role,
        status: membership.status ?? "ACTIVE",
      };
    })
  );
  return {
    members: people,
    invitations: invitations
      .filter((row) => !row.acceptedAt && !row.revokedAt && new Date(row.expiresAt).getTime() > now)
      .map((row) => ({
        id: row.id,
        emailNormalized: row.emailNormalized,
        role: row.role,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
      })),
  };
}

export async function activeMembershipsForIdentity(store: PersistencePort, userId: string) {
  return (await store.listMemberships(userId)).filter((row) => row.status !== "SUSPENDED");
}

export async function membershipSummaries(store: PersistencePort, userId: string) {
  const memberships = await activeMembershipsForIdentity(store, userId);
  return Promise.all(
    memberships.map(async (membership) => {
      const organisation = await store.getOrganisation(membership.organisationId);
      return {
        organisationId: membership.organisationId,
        name: organisation?.name ?? membership.organisationId,
        role: membership.role,
        status: membership.status ?? "ACTIVE",
      };
    })
  );
}

export function postAuthPath(input: {
  emailVerified: boolean;
  membershipCount: number;
  hasSelectedOrganisation: boolean;
}): string {
  if (!input.emailVerified) return "/verify-email";
  if (input.membershipCount === 0) return "/onboarding/organisation";
  if (input.membershipCount > 1 && !input.hasSelectedOrganisation) return "/select-organisation";
  return "/app";
}

async function uniqueSlug(store: PersistencePort, base: string): Promise<string> {
  let slug = base;
  let n = 2;
  while (await store.getOrganisationBySlug(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}
