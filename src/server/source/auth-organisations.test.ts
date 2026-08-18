import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { MemoryPersistence } from "@/infrastructure/database/memory";
import { TEST_IDENTITY_HEADER, type AuthIdentity } from "@/infrastructure/auth/identity";
import { resetRuntimeForTests, setPersistenceForRuntime } from "@/infrastructure/runtime";
import {
  acceptInvitation,
  changeMembershipRole,
  createOrganisationForIdentity,
  inviteColleague,
  revokeInvitation,
  slugifyOrganisationName,
  suspendMembership,
} from "@/server/source/organisations";
import { encodeActiveOrganisation } from "@/server/source/principal";
import { hashToken } from "@/infrastructure/crypto/tokens";
import { ROLE_CAPABILITIES } from "@/server/source/authorization";
import { GET as getWorkspace } from "@/app/api/source/workspace/route";
import { GET as getTeam } from "@/app/api/organisations/team/route";
import { loadSourceEnvironment, SourceEnvironmentError } from "@/infrastructure/environment/source-environment";
import {
  DEV_PREVIEW_SUPABASE_URL,
  PRODUCTION_SUPABASE_URL,
} from "@/infrastructure/environment/source-environment";

const NOW = new Date("2026-08-18T12:00:00.000Z");

function identity(partial: Partial<AuthIdentity> & Pick<AuthIdentity, "userId" | "email">): AuthIdentity {
  return {
    emailVerified: true,
    authenticationMethod: "TEST",
    ...partial,
  };
}

async function createOwnedOrg(store: MemoryPersistence, person: AuthIdentity, name: string, key = `${person.userId}-org`) {
  return createOrganisationForIdentity({
    store,
    identity: person,
    name,
    country: "Netherlands",
    idempotencyKey: key,
    now: NOW,
  });
}

function authedRequest(person: AuthIdentity, organisationId: string, path: string) {
  return new Request(`http://localhost:3000${path}`, {
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      [TEST_IDENTITY_HEADER]: JSON.stringify(person),
      cookie: `source_organisation=${encodeURIComponent(encodeActiveOrganisation(person.userId, organisationId))}`,
    },
  });
}

describe("organisation slugs", () => {
  it("slugifies names and suffixes collisions", async () => {
    expect(slugifyOrganisationName("Acme Metals")).toBe("acme-metals");
    const store = new MemoryPersistence();
    const alice = identity({ userId: "auth-alice", email: "alice@a.example" });
    const first = await createOwnedOrg(store, alice, "Acme", "alice-1");
    const second = await createOrganisationForIdentity({
      store,
      identity: identity({ userId: "auth-alice-2", email: "alice2@a.example" }),
      name: "Acme",
      country: "NL",
      idempotencyKey: "alice-2",
      now: NOW,
    });
    expect(first.organisation.slug).toBe("acme-2");
    expect(second.organisation.slug).toBe("acme-3");
  });
});

describe("organisation lifecycle", () => {
  it("creates an OWNER, empty engine, and is idempotent on retry", async () => {
    const store = new MemoryPersistence();
    const alice = identity({ userId: "auth-alice", email: "alice@a.example" });
    const first = await createOwnedOrg(store, alice, "Manufacturer A");
    expect(first.principal.roles).toEqual(["OWNER"]);
    expect(first.principal.capabilities).toEqual(ROLE_CAPABILITIES.OWNER);
    const engine = await store.loadEngine(first.organisation.id);
    expect(engine.requirements).toHaveLength(0);
    expect(engine.subjects).toHaveLength(0);
    expect(engine.tenant.name).toBe("Manufacturer A");
    expect(engine.tenant.id).toBe(first.organisation.id);

    const retry = await createOwnedOrg(store, alice, "Manufacturer A copy");
    expect(retry.alreadyProcessed).toBe(true);
    expect(retry.organisation.id).toBe(first.organisation.id);
    const owned = (await store.listMemberships(alice.userId)).filter((row) => row.role === "OWNER");
    expect(owned).toHaveLength(1);
  });

  it("blocks unverified users from creating an organisation", async () => {
    const store = new MemoryPersistence();
    await expect(
      createOrganisationForIdentity({
        store,
        identity: identity({ userId: "unverified", email: "wait@a.example", emailVerified: false }),
        name: "Too Soon",
        country: "NL",
        idempotencyKey: "nope",
        now: NOW,
      })
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("invitations", () => {
  it("requires matching email, accepts once, and rejects expired or revoked tokens", async () => {
    const store = new MemoryPersistence();
    const alice = identity({ userId: "auth-alice", email: "alice@a.example" });
    const charlie = identity({ userId: "auth-charlie", email: "charlie@c.example" });
    const bob = identity({ userId: "auth-bob", email: "bob@b.example" });
    const { organisation, principal } = await createOwnedOrg(store, alice, "Manufacturer A");
    const invited = await inviteColleague({
      store,
      principal,
      email: "charlie@c.example",
      role: "MEMBER",
      now: NOW,
      exposeInviteUrl: true,
    });
    expect(invited.inviteUrl).toMatch(/^\/invitations\//);
    expect(JSON.stringify(invited.invitation)).not.toContain(invited.inviteUrl?.split("/").pop());
    const token = invited.inviteUrl!.split("/").pop()!;
    expect(invited.invitation.tokenHash).toBe(hashToken(token));

    await expect(acceptInvitation({ store, identity: bob, rawToken: token, now: NOW })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const accepted = await acceptInvitation({ store, identity: charlie, rawToken: token, now: NOW });
    expect(accepted.organisationId).toBe(organisation.id);
    expect(accepted.roles).toEqual(["MEMBER"]);
    const again = await acceptInvitation({ store, identity: charlie, rawToken: token, now: NOW });
    expect(again.membershipId).toBe(accepted.membershipId);
    expect((await store.listOrganisationMemberships(organisation.id)).filter((row) => row.userId === charlie.userId)).toHaveLength(
      1
    );

    const expired = await inviteColleague({
      store,
      principal,
      email: "dana@d.example",
      role: "MEMBER",
      ttlDays: 7,
      now: NOW,
      exposeInviteUrl: true,
    });
    const expiredToken = expired.inviteUrl!.split("/").pop()!;
    await expect(
      acceptInvitation({
        store,
        identity: identity({ userId: "auth-dana", email: "dana@d.example" }),
        rawToken: expiredToken,
        now: new Date("2026-08-26T12:00:00.000Z"),
      })
    ).rejects.toMatchObject({ code: "EXPIRED" });

    const revocable = await inviteColleague({
      store,
      principal,
      email: "erin@e.example",
      role: "ADMIN",
      now: NOW,
      exposeInviteUrl: true,
    });
    await revokeInvitation({ store, principal, invitationId: revocable.invitation.id, now: NOW });
    await expect(
      acceptInvitation({
        store,
        identity: identity({ userId: "auth-erin", email: "erin@e.example" }),
        rawToken: revocable.inviteUrl!.split("/").pop()!,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: "EXPIRED" });
  });

  it("does not invite an active member again and replaces a pending invite", async () => {
    const store = new MemoryPersistence();
    const alice = identity({ userId: "auth-alice", email: "alice@a.example" });
    const { principal } = await createOwnedOrg(store, alice, "Manufacturer A");
    await inviteColleague({ store, principal, email: "charlie@c.example", role: "MEMBER", now: NOW });
    const second = await inviteColleague({ store, principal, email: "charlie@c.example", role: "ADMIN", now: NOW });
    const pending = (await store.listInvitations(principal.organisationId)).filter(
      (row) => row.emailNormalized === "charlie@c.example" && !row.revokedAt && !row.acceptedAt
    );
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(second.invitation.id);

    await store.saveUser({ id: "auth-charlie", email: "charlie@c.example", displayName: "Charlie" });
    await store.saveMembership({
      id: "mem-charlie",
      userId: "auth-charlie",
      organisationId: principal.organisationId,
      role: "MEMBER",
      capabilities: [...ROLE_CAPABILITIES.MEMBER],
      status: "ACTIVE",
    });
    await expect(
      inviteColleague({ store, principal, email: "charlie@c.example", role: "ADMIN", now: NOW })
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("roles and owner safety", () => {
  it("lets OWNER and ADMIN invite, and blocks MEMBER and REVIEWER from managing the organisation", async () => {
    const store = new MemoryPersistence();
    const alice = identity({ userId: "auth-alice", email: "alice@a.example" });
    const { principal: owner } = await createOwnedOrg(store, alice, "Manufacturer A");
    const adminInvite = await inviteColleague({
      store,
      principal: owner,
      email: "admin@a.example",
      role: "ADMIN",
      now: NOW,
      exposeInviteUrl: true,
    });
    const admin = await acceptInvitation({
      store,
      identity: identity({ userId: "auth-admin", email: "admin@a.example" }),
      rawToken: adminInvite.inviteUrl!.split("/").pop()!,
      now: NOW,
    });
    await inviteColleague({ store, principal: admin, email: "member@a.example", role: "MEMBER", now: NOW });

    const memberInvite = await inviteColleague({
      store,
      principal: owner,
      email: "member2@a.example",
      role: "MEMBER",
      now: NOW,
      exposeInviteUrl: true,
    });
    const member = await acceptInvitation({
      store,
      identity: identity({ userId: "auth-member", email: "member2@a.example" }),
      rawToken: memberInvite.inviteUrl!.split("/").pop()!,
      now: NOW,
    });
    await expect(
      inviteColleague({ store, principal: member, email: "other@a.example", role: "MEMBER", now: NOW })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const reviewerInvite = await inviteColleague({
      store,
      principal: owner,
      email: "reviewer@a.example",
      role: "REVIEWER",
      now: NOW,
      exposeInviteUrl: true,
    });
    const reviewer = await acceptInvitation({
      store,
      identity: identity({ userId: "auth-reviewer", email: "reviewer@a.example" }),
      rawToken: reviewerInvite.inviteUrl!.split("/").pop()!,
      now: NOW,
    });
    await expect(
      changeMembershipRole({ store, principal: reviewer, membershipId: member.membershipId, role: "ADMIN", now: NOW })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("prevents the last active OWNER from demoting or suspending themselves", async () => {
    const store = new MemoryPersistence();
    const alice = identity({ userId: "auth-alice", email: "alice@a.example" });
    const { principal } = await createOwnedOrg(store, alice, "Manufacturer A");
    await expect(
      changeMembershipRole({ store, principal, membershipId: principal.membershipId, role: "ADMIN", now: NOW })
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(suspendMembership({ store, principal, membershipId: principal.membershipId, now: NOW })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("excludes suspended memberships from tenant access", async () => {
    const store = new MemoryPersistence();
    const alice = identity({ userId: "auth-alice", email: "alice@a.example" });
    const { principal } = await createOwnedOrg(store, alice, "Manufacturer A");
    const invite = await inviteColleague({
      store,
      principal,
      email: "member@a.example",
      role: "MEMBER",
      now: NOW,
      exposeInviteUrl: true,
    });
    const member = await acceptInvitation({
      store,
      identity: identity({ userId: "auth-member", email: "member@a.example" }),
      rawToken: invite.inviteUrl!.split("/").pop()!,
      now: NOW,
    });
    await suspendMembership({ store, principal, membershipId: member.membershipId, now: NOW });
    const { resolveOrganisationPrincipal } = await import("@/server/source/organisations");
    await expect(
      resolveOrganisationPrincipal(
        store,
        identity({ userId: "auth-member", email: "member@a.example" }),
        principal.organisationId
      )
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("Alice / Bob tenant isolation with real principals", () => {
  let store: MemoryPersistence;
  let alice: AuthIdentity;
  let bob: AuthIdentity;
  let orgA: string;
  let orgB: string;

  beforeEach(async () => {
    store = new MemoryPersistence();
    alice = identity({ userId: "auth-alice", email: "alice@a.example" });
    bob = identity({ userId: "auth-bob", email: "bob@b.example" });
    orgA = (await createOwnedOrg(store, alice, "Manufacturer A")).organisation.id;
    orgB = (await createOwnedOrg(store, bob, "Manufacturer B", "bob-org")).organisation.id;
    setPersistenceForRuntime(store);
  });

  afterEach(() => {
    resetRuntimeForTests();
  });

  it("rejects known-id cross-tenant workspace and team access with RESOURCE_UNAVAILABLE", async () => {
    const aliceOnB = await getWorkspace(authedRequest(alice, orgB, "/api/source/workspace"));
    expect(aliceOnB.status).toBe(404);
    expect(await aliceOnB.json()).toMatchObject({ error: "RESOURCE_UNAVAILABLE" });

    const bobOnA = await getTeam(authedRequest(bob, orgA, "/api/organisations/team"));
    expect(bobOnA.status).toBe(404);
    expect(await bobOnA.json()).toMatchObject({ error: "RESOURCE_UNAVAILABLE" });

    const aliceHome = await getWorkspace(authedRequest(alice, orgA, "/api/source/workspace"));
    expect(aliceHome.status).toBe(200);
    const payload = await aliceHome.json();
    expect(payload.organisation.id).toBe(orgA);
    expect(payload.liveCounts.requirements).toBe(0);
  });

  it("returns 401 after the identity header is gone", async () => {
    const loggedOut = await getWorkspace(
      new Request("http://localhost:3000/api/source/workspace", {
        headers: { host: "localhost:3000" },
      })
    );
    expect(loggedOut.status).toBe(401);
  });
});

describe("auth environment fail-closed", () => {
  it("rejects the test identity provider in preview and production", () => {
    expect(() =>
      loadSourceEnvironment({
        SOURCE_ENV: "preview",
        NEXT_PUBLIC_SUPABASE_URL: DEV_PREVIEW_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key-not-a-secret",
        SOURCE_APP_DATABASE_URL: "postgres://source_app:not-a-real-secret@localhost:5432/postgres",
        SOURCE_SESSION_SECRET: "test-session-secret",
        SOURCE_OPAQUE_REF_SECRET: "test-opaque-secret",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role-not-a-secret",
        SOURCE_IDENTITY_PROVIDER: "test",
      })
    ).toThrow(SourceEnvironmentError);
    expect(() =>
      loadSourceEnvironment({
        SOURCE_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
        SOURCE_APP_DATABASE_URL: "postgres://source_app:not-a-real-secret@localhost:5432/postgres",
        SOURCE_SESSION_SECRET: "test-session-secret",
        SOURCE_OPAQUE_REF_SECRET: "test-opaque-secret",
      })
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY is required/);
  });
});
