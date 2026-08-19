import { currentDataDisclosureTerms } from "@/domain/source/disclosure-terms";
import { dispatchCommand } from "@/server/source/commands/dispatch";
import type { PersistencePort } from "@/infrastructure/database/ports";
import type { PortalPrincipal } from "@/server/source/types";
import type { Command } from "@/domain/source/types";

export async function acceptPortalDisclosure(
  store: PersistencePort,
  portal: PortalPrincipal,
  caseId: string,
  now: Date
) {
  const terms = currentDataDisclosureTerms();
  return dispatchCommand({
    store,
    principal: portal,
    envelope: {
      commandId: `accept-${caseId}`,
      idempotencyKey: `accept-${caseId}`,
      principalId: portal.grantId,
      organisationId: portal.organisationId,
      issuedAt: now.toISOString(),
      command: {
        type: "ACCEPT_EVIDENCE_DISCLOSURE",
        caseId,
        authorityConfirmed: true,
        termsAccepted: true,
        agreementId: terms.agreementId,
        agreementVersion: terms.version,
        reusePolicy: "REUSE_WITHIN_REQUESTING_ORGANISATION",
      },
    },
    now,
  });
}

export function portalEvidenceSubmit(
  caseId: string,
  extra: Partial<Extract<Command, { type: "SUBMIT_RESPONSE" }>> & {
    value: string;
    evidence?: Extract<Command, { type: "SUBMIT_RESPONSE" }>["evidence"];
  }
): Extract<Command, { type: "SUBMIT_RESPONSE" }> {
  return {
    type: "SUBMIT_RESPONSE",
    caseId,
    unit: "%",
    permission: "GRANTED",
    evidenceRoute: "ORIGINAL_DOCUMENT",
    disclosureMode: "SHARE_SOURCE",
    reusePolicy: "ASK_FOR_REUSE",
    ...extra,
  };
}
