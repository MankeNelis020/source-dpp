import { ROLE_CAPABILITIES } from "@/server/source/authorization";
import type { EngineState } from "@/domain/source/types";
import { createSeedState, emptyState } from "@/domain/source";
import { hashToken } from "@/infrastructure/crypto/tokens";
import { PORTAL_ALLOWED_DEFAULT, type ImportJob, type ImportJobEvent, type ImmutableAuditEvent, type Membership, type Organisation, type ProcessedCommand, type SupplierPortalGrant, type UserRecord } from "@/server/source/types";
import type { EvidenceObject, PersistencePort } from "./ports";

const DEMO_EXPIRY = "2027-08-17T00:00:00.000Z";

function nordicSeed(): EngineState {
  const state = emptyState();
  state.tenant = { id: "nordic", name: "Nordic Chairs Oy", identityAutoLinkThreshold: 95 };
  state.actors.push({
    id: "nordic",
    name: "Nordic Chairs",
    legalName: "Nordic Chairs Oy",
    kind: "organisation",
    country: "Finland",
  });
  state.actors.push({
    id: "mill-private",
    name: "Secret Mill",
    legalName: "Secret Mill AB",
    kind: "organisation",
    country: "Sweden",
    confidential: true,
  });
  state.subjects.push({
    id: "fjord-stool",
    kind: "PRODUCT",
    name: "Fjord Stool",
    createdAt: "2026-08-01T09:00:00.000Z",
    source: "IMPORTED",
  });
  state.requirements.push({
    id: "req-nordic-origin",
    tenantId: "nordic",
    subjectId: "fjord-stool",
    subjectLabel: "Fjord Stool",
    productIds: ["fjord-stool"],
    propertyId: "origin_country",
    propertyLabel: "Country of manufacture",
    datasetId: "espr-al-2027",
    purpose: "DPP_COMPLIANCE",
    requiredTrustLevel: "EVIDENCED",
    requiredPermissionLevel: "granted",
    requiredBy: "2027-02-01",
    priority: 80,
    createdAt: "2026-08-01T09:00:00.000Z",
    linkedCaseId: "SRC-N-1",
  });
  state.cases.push({
    id: "SRC-N-1",
    requirementId: "req-nordic-origin",
    state: "WAITING_RESPONSE",
    currentActorId: "mill-private",
    nextAction: "Wait for supplier.",
    escalationPolicyId: "standard_supplier_14d",
    ownerLabel: "SOURCE",
    openedAt: "2026-08-10T09:00:00.000Z",
    version: 1,
    identityStatus: "IDENTITY_MATCHED",
    productId: "fjord-stool",
    supplierId: "mill-private",
    automationLevel: "L2",
    portalToken: "nordic-secret",
  });
  state.claims.push({
    id: "claim-nordic-private",
    requirementId: "req-nordic-origin",
    caseId: "SRC-N-1",
    propertyId: "origin_country",
    value: "FI",
    subjectId: "fjord-stool",
    productId: "fjord-stool",
    declaredByActorId: "mill-private",
    evidenceId: "ev-nordic-private",
    trustLevel: "EVIDENCED",
    permissionState: "GRANTED",
    purpose: "DPP_COMPLIANCE",
    identityConfidence: 99,
    ready: false,
  });
  state.evidence.push({
    id: "ev-nordic-private",
    filename: "nordic-origin-certificate.pdf",
    sha256: "aa".repeat(32),
    issuer: "Secret Mill AB",
    ownerActorId: "mill-private",
    expired: false,
    scope: { kind: "product", id: "fjord-stool", label: "Fjord Stool" },
    visibility: "private",
    linkedClaimIds: ["claim-nordic-private"],
  });
  return state;
}

function portalGrant(partial: Omit<SupplierPortalGrant, "createdAt" | "allowedCommands"> & { allowedCommands?: SupplierPortalGrant["allowedCommands"] }): SupplierPortalGrant {
  return {
    createdAt: "2026-08-01T09:00:00.000Z",
    allowedCommands: PORTAL_ALLOWED_DEFAULT,
    ...partial,
  };
}

export class MemoryPersistence implements PersistencePort {
  organisations = new Map<string, Organisation>();
  users = new Map<string, UserRecord>();
  memberships: Membership[] = [];
  engines = new Map<string, EngineState>();
  processed = new Map<string, ProcessedCommand>();
  portalGrants: SupplierPortalGrant[] = [];
  audit: ImmutableAuditEvent[] = [];
  importJobs = new Map<string, ImportJob>();
  importEvents = new Map<string, ImportJobEvent[]>();
  evidence = new Map<string, EvidenceObject>();
  seq = 1;

  constructor() {
    this.reset();
  }

  reset() {
    this.organisations = new Map([
      ["acme", { id: "acme", name: "Acme Manufacturing B.V.", slug: "acme" }],
      ["nordic", { id: "nordic", name: "Nordic Chairs Oy", slug: "nordic" }],
    ]);
    this.users = new Map([
      ["user-acme-owner", { id: "user-acme-owner", email: "owner@acme.example", displayName: "Acme Owner" }],
      ["user-acme-reviewer", { id: "user-acme-reviewer", email: "reviewer@acme.example", displayName: "Acme Reviewer" }],
      ["user-nordic-owner", { id: "user-nordic-owner", email: "owner@nordic.example", displayName: "Nordic Owner" }],
    ]);
    this.memberships = [
      { id: "mem-acme-owner", userId: "user-acme-owner", organisationId: "acme", role: "OWNER", capabilities: [...ROLE_CAPABILITIES.OWNER] },
      { id: "mem-acme-reviewer", userId: "user-acme-reviewer", organisationId: "acme", role: "REVIEWER", capabilities: [...ROLE_CAPABILITIES.REVIEWER] },
      { id: "mem-nordic-owner", userId: "user-nordic-owner", organisationId: "nordic", role: "OWNER", capabilities: [...ROLE_CAPABILITIES.OWNER] },
    ];
    this.engines = new Map([
      ["acme", createSeedState()],
      ["nordic", nordicSeed()],
    ]);
    this.processed.clear();
    this.portalGrants = [
      portalGrant({
        id: "grant-demo",
        tokenHash: hashToken("demo"),
        actorId: "supplier-a",
        tenantContextId: "acme",
        allowedCaseIds: createSeedState()
          .cases.filter((c) => c.supplierId === "supplier-a" && c.state !== "READY" && c.state !== "MONITORING")
          .map((c) => c.id),
        allowedRequirementIds: createSeedState()
          .cases.filter((c) => c.supplierId === "supplier-a")
          .map((c) => c.requirementId),
        expiresAt: DEMO_EXPIRY,
      }),
      portalGrant({
        id: "grant-textile",
        tokenHash: hashToken("textile"),
        actorId: "supplier-b",
        tenantContextId: "acme",
        allowedCaseIds: ["SRC-184830"],
        allowedRequirementIds: ["req-textile-origin"],
        expiresAt: DEMO_EXPIRY,
      }),
      portalGrant({
        id: "grant-expired",
        tokenHash: hashToken("expired-token"),
        actorId: "supplier-a",
        tenantContextId: "acme",
        allowedCaseIds: ["SRC-184831"],
        allowedRequirementIds: ["req-pack-recycled"],
        expiresAt: "2020-01-01T00:00:00.000Z",
      }),
      portalGrant({
        id: "grant-revoked",
        tokenHash: hashToken("revoked-token"),
        actorId: "supplier-a",
        tenantContextId: "acme",
        allowedCaseIds: ["SRC-184831"],
        allowedRequirementIds: ["req-pack-recycled"],
        expiresAt: DEMO_EXPIRY,
        revokedAt: "2026-08-01T00:00:00.000Z",
      }),
      portalGrant({
        id: "grant-nordic",
        tokenHash: hashToken("nordic-secret"),
        actorId: "mill-private",
        tenantContextId: "nordic",
        allowedCaseIds: ["SRC-N-1"],
        allowedRequirementIds: ["req-nordic-origin"],
        expiresAt: DEMO_EXPIRY,
      }),
    ];
    const extraTokens = ["packaging", "fasteners", "trader", "wrong-contact", "unknown", "yarn", "dye", "reach", "steel", "conflict", "identity", "carbon", "wood", "minerals"] as const;
    const acme = this.engines.get("acme")!;
    for (const token of extraTokens) {
      const resolution = acme.cases.find((c) => c.portalToken === token);
      if (!resolution) continue;
      this.portalGrants.push(
        portalGrant({
          id: `grant-${token}`,
          tokenHash: hashToken(token),
          actorId: resolution.currentActorId ?? resolution.supplierId ?? "supplier-a",
          tenantContextId: "acme",
          allowedCaseIds: [resolution.id],
          allowedRequirementIds: [resolution.requirementId],
          expiresAt: DEMO_EXPIRY,
        })
      );
    }
    this.audit = [];
    this.importJobs.clear();
    this.importEvents.clear();
    this.evidence.clear();
    this.seq = 1000;
  }

  getOrganisation(id: string) {
    return this.organisations.get(id);
  }
  getOrganisationBySlug(slug: string) {
    return [...this.organisations.values()].find((o) => o.slug === slug);
  }
  getUserById(id: string) {
    return this.users.get(id);
  }
  getUserByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email.toLowerCase());
  }
  getMembership(userId: string, organisationId: string) {
    return this.memberships.find((m) => m.userId === userId && m.organisationId === organisationId);
  }
  listMemberships(userId: string) {
    return this.memberships.filter((m) => m.userId === userId);
  }
  loadEngine(organisationId: string) {
    const state = this.engines.get(organisationId);
    if (!state) {
      const empty = emptyState();
      empty.tenant.id = organisationId;
      this.engines.set(organisationId, empty);
      return structuredClone(empty);
    }
    return structuredClone(state);
  }
  saveEngine(organisationId: string, state: EngineState) {
    this.engines.set(organisationId, structuredClone(state));
  }
  findProcessedCommand(organisationId: string, idempotencyKey: string) {
    return this.processed.get(`${organisationId}:${idempotencyKey}`);
  }
  saveProcessedCommand(record: ProcessedCommand) {
    this.processed.set(`${record.organisationId}:${record.idempotencyKey}`, record);
  }
  findPortalGrantByTokenHash(hash: string) {
    return this.portalGrants.find((g) => g.tokenHash === hash);
  }
  savePortalGrant(grant: SupplierPortalGrant) {
    const idx = this.portalGrants.findIndex((g) => g.id === grant.id);
    if (idx >= 0) this.portalGrants[idx] = grant;
    else this.portalGrants.push(grant);
  }
  listPortalGrantsForTenant(organisationId: string) {
    return this.portalGrants.filter((g) => g.tenantContextId === organisationId);
  }
  appendAudit(event: ImmutableAuditEvent) {
    this.audit.push(event);
  }
  listAudit(organisationId: string) {
    return this.audit.filter((e) => e.organisationId === organisationId);
  }
  saveImportJob(job: ImportJob) {
    this.importJobs.set(job.id, { ...job });
  }
  getImportJob(id: string) {
    const job = this.importJobs.get(id);
    return job ? { ...job } : undefined;
  }
  listImportJobs(organisationId: string) {
    return [...this.importJobs.values()].filter((j) => j.organisationId === organisationId);
  }
  appendImportEvent(event: ImportJobEvent) {
    const list = this.importEvents.get(event.jobId) ?? [];
    list.push(event);
    this.importEvents.set(event.jobId, list);
  }
  listImportEvents(jobId: string) {
    return [...(this.importEvents.get(jobId) ?? [])];
  }
  putEvidence(object: EvidenceObject) {
    if (this.evidence.has(object.evidenceId)) {
      throw new Error("Evidence objects are immutable");
    }
    this.evidence.set(object.evidenceId, object);
  }
  getEvidence(evidenceId: string) {
    return this.evidence.get(evidenceId);
  }
  nextId(prefix: string) {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }
}

let singleton: MemoryPersistence | undefined;

export function getMemoryPersistence(): MemoryPersistence {
  if (!singleton) singleton = new MemoryPersistence();
  return singleton;
}

export function resetMemoryPersistence() {
  getMemoryPersistence().reset();
}
