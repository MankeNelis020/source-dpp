import { generateBearerToken } from "@/infrastructure/crypto/tokens";
import type { PersistencePort } from "@/infrastructure/database/ports";
import type { OutboxRecord } from "@/infrastructure/outbox/types";
import type { EngineState } from "@/domain/source/types";
import { issuePortalGrant } from "@/server/source/portal";
import { supplierRequestMessage } from "@/infrastructure/email/supplier-request";

const GRANT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function appBaseUrl() {
  return (process.env.SOURCE_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function contactEmailForActor(state: EngineState, actorId: string | undefined) {
  if (!actorId) return undefined;
  return state.contacts.find((c) => c.actorId === actorId && c.valid && c.email)?.email;
}

export async function queueSupplierOutreach(args: {
  store: PersistencePort;
  organisationId: string;
  organisationName: string;
  state: EngineState;
  supplierActorId: string;
  caseIds: string[];
  semanticKey: string;
  now: Date;
}): Promise<OutboxRecord | undefined> {
  const { store, organisationId, organisationName, state, supplierActorId, caseIds, semanticKey, now } = args;
  const uniqueCaseIds = [...new Set(caseIds)];
  if (!uniqueCaseIds.length) return undefined;
  const to = contactEmailForActor(state, supplierActorId);
  if (!to) return undefined;

  const token = generateBearerToken();
  const requirementIds = uniqueCaseIds
    .map((id) => state.cases.find((c) => c.id === id)?.requirementId)
    .filter((id): id is string => Boolean(id));

  await issuePortalGrant(store, {
    token,
    actorId: supplierActorId,
    organisationId,
    allowedCaseIds: uniqueCaseIds,
    allowedRequirementIds: requirementIds,
    expiresAt: new Date(now.getTime() + GRANT_TTL_MS).toISOString(),
  });

  const message = supplierRequestMessage({
    organisationName,
    itemCount: uniqueCaseIds.length,
    portalUrl: `${appBaseUrl()}/s/${token}`,
    expiresAt: new Date(now.getTime() + GRANT_TTL_MS),
  });

  return {
    id: store.nextId("obx"),
    organisationId,
    eventType: "email.queued",
    aggregateType: "SupplierRequest",
    aggregateId: uniqueCaseIds[0],
    semanticKey,
    payload: {
      kind: "SUPPLIER_REQUEST",
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      supplierActorId,
      caseIds: uniqueCaseIds,
      itemCount: uniqueCaseIds.length,
    },
    status: "PENDING",
    availableAt: now.toISOString(),
    attemptCount: 0,
    createdAt: now.toISOString(),
  };
}
