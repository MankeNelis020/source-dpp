import { STANDARD_SUPPLIER_14D } from "./escalation";
import { emptyState } from "./engine";
import type {
  EngineState,
  InformationRequirement,
  ResolutionAttempt,
  ResolutionCase,
  SupplierRequest,
} from "./types";

const NOW = "2026-08-17T09:00:00.000Z";

function req(
  partial: Omit<InformationRequirement, "tenantId" | "purpose" | "requiredTrustLevel" | "requiredPermissionLevel" | "createdAt"> &
    Partial<InformationRequirement>
): InformationRequirement {
  return {
    tenantId: "acme",
    purpose: "DPP_COMPLIANCE",
    requiredTrustLevel: "EVIDENCED",
    requiredPermissionLevel: "granted",
    createdAt: "2026-08-01T09:00:00.000Z",
    ...partial,
  };
}

function resolution(
  partial: Omit<ResolutionCase, "automationLevel" | "version" | "openedAt" | "escalationPolicyId"> &
    Partial<ResolutionCase>
): ResolutionCase {
  return {
    automationLevel: "L2",
    version: 1,
    openedAt: "2026-08-01T09:00:00.000Z",
    escalationPolicyId: STANDARD_SUPPLIER_14D.id,
    ...partial,
  };
}

export function createSeedState(): EngineState {
  const state = emptyState();
  state.seq = 900;

  state.actors = [
    { id: "acme", name: "Acme Manufacturing", legalName: "Acme Manufacturing B.V.", kind: "organisation", vat: "NL822012345B01", country: "Netherlands", domain: "acme.example" },
    { id: "supplier-a", name: "Supplier A", legalName: "Supplier A GmbH", kind: "organisation", vat: "DE813334455", country: "Germany", domain: "suppliera.example" },
    { id: "supplier-b", name: "Supplier B", legalName: "Supplier B S.r.l.", kind: "organisation", vat: "IT01234567890", country: "Italy", domain: "supplierb.example" },
    { id: "furnco", name: "FurnCo", legalName: "FurnCo BV", kind: "organisation", vat: "NL001234567B01", country: "Netherlands" },
    { id: "mill-north", name: "Nordic Fibre Mill", legalName: "Nordic Fibre Mill Oy", kind: "organisation", country: "Finland", confidential: true },
    { id: "acme-alu-erp", name: "Acme Aluminium", legalName: "Acme Aluminium", kind: "organisation", country: "Germany" },
    { id: "acme-alu-gmbh", name: "Acme Aluminium GmbH", legalName: "Acme Aluminium GmbH", kind: "organisation", vat: "DE811128135", country: "Germany" },
    { id: "trader-x", name: "TradeLink Agents", legalName: "TradeLink Agents Ltd", kind: "organisation", country: "United Kingdom" },
  ];

  state.contacts = [
    { id: "ct-a-data", actorId: "supplier-a", role: "product_data", name: "Lena Hofmann", email: "data@suppliera.example", valid: true, lastSuccessAt: "2026-08-14" },
    { id: "ct-a-sales", actorId: "supplier-a", role: "sales", name: "Sales desk", email: "sales@suppliera.example", valid: true },
    { id: "ct-b-gen", actorId: "supplier-b", role: "general", name: "Info", email: "info@supplierb.example", valid: true },
    { id: "ct-b-comp", actorId: "supplier-b", role: "compliance", name: "Maria Rossi", email: "compliance@supplierb.example", valid: true },
    { id: "ct-trader-old", actorId: "trader-x", role: "general", name: "Old mailbox", email: "ops@tradelink.invalid", valid: false },
    { id: "ct-furnco", actorId: "furnco", role: "quality", name: "Quality", email: "quality@furnco.example", valid: true },
  ];

  state.relationships = [
    { id: "rel-acme-a", fromActorId: "acme", toActorId: "supplier-a", subjectId: "AL-FRAME-881", confidentialUpstream: false, confidentialDownstream: false, hideCustomer: false },
    { id: "rel-acme-b", fromActorId: "acme", toActorId: "supplier-b", subjectId: "TEXTILE-04", confidentialUpstream: false, confidentialDownstream: false, hideCustomer: false },
    { id: "rel-b-mill", fromActorId: "supplier-b", toActorId: "mill-north", subjectId: "YARN-04", confidentialUpstream: true, confidentialDownstream: true, hideCustomer: true },
  ];

  state.requirements = [
    req({ id: "req-al-recycled", subjectId: "AL-FRAME-881", subjectLabel: "Aluminium Frame", productIds: ["urban-chair-04"], propertyId: "recycled_content", propertyLabel: "Recycled content", datasetId: "espr-al-2027", requiredBy: "2027-02-01", priority: 98, resolvedAt: "2026-08-14T10:00:00.000Z", linkedCaseId: "SRC-184821" }),
    req({ id: "req-textile-origin", subjectId: "TEXTILE-04", subjectLabel: "Textile origin", productIds: ["urban-chair-04"], propertyId: "origin_country", propertyLabel: "Textile origin", datasetId: "espr-al-2027", requiredBy: "2027-02-01", priority: 96, linkedCaseId: "SRC-184830" }),
    req({ id: "req-pack-recycled", subjectId: "PACK-04", subjectLabel: "Packaging", productIds: ["urban-chair-04"], propertyId: "recycled_content", propertyLabel: "Packaging recycled content", datasetId: "espr-al-2027", requiredBy: "2027-02-01", priority: 90, linkedCaseId: "SRC-184831" }),
    req({ id: "req-fastener-cert", subjectId: "FASTEN-04", subjectLabel: "Fasteners", productIds: ["urban-chair-04"], propertyId: "iso14021_certificate", propertyLabel: "Fastener certificate", datasetId: "espr-al-2027", requiredBy: "2026-09-09", priority: 88, linkedCaseId: "SRC-184832" }),
    req({ id: "req-trader-origin", subjectId: "AL-ROD-12", subjectLabel: "Aluminium rod", productIds: ["lounge-11"], propertyId: "origin_country", propertyLabel: "Rod origin", datasetId: "espr-al-2027", requiredBy: "2027-02-01", priority: 70, linkedCaseId: "SRC-184840" }),
    req({ id: "req-wrong-contact", subjectId: "FABRIC-X", subjectLabel: "Upholstery fabric", productIds: ["shelf-07"], propertyId: "origin_country", propertyLabel: "Fabric origin", datasetId: "espr-al-2027", requiredBy: "2027-02-01", priority: 60, linkedCaseId: "SRC-184841" }),
    req({ id: "req-unknown", subjectId: "FOAM-02", subjectLabel: "Seat foam", productIds: ["desk-02"], propertyId: "recycled_content", propertyLabel: "Foam recycled content", datasetId: "espr-al-2027", requiredBy: "2027-02-01", priority: 55, linkedCaseId: "SRC-184842" }),
    req({ id: "req-yarn", subjectId: "YARN-04", subjectLabel: "Yarn", productIds: ["urban-chair-04"], propertyId: "recycled_content", propertyLabel: "Yarn recycled content", datasetId: "espr-al-2027", requiredBy: "2027-02-01", priority: 80, linkedCaseId: "SRC-184843" }),
    req({ id: "req-dye", subjectId: "DYE-04", subjectLabel: "Dye stuff", productIds: ["urban-chair-04"], propertyId: "origin_country", propertyLabel: "Dye origin", datasetId: "espr-al-2027", requiredBy: "2027-02-01", priority: 75, linkedCaseId: "SRC-184844" }),
    req({ id: "req-reach", subjectId: "COAT-11", subjectLabel: "Coating", productIds: ["lounge-11"], propertyId: "reach_svhc", propertyLabel: "REACH SVHC", datasetId: "espr-al-2027", requiredBy: "2027-02-01", priority: 85, linkedCaseId: "SRC-184845" }),
    req({ id: "req-steel", subjectId: "STEEL-07", subjectLabel: "Steel bracket", productIds: ["shelf-07"], propertyId: "recycled_content", propertyLabel: "Steel recycled content", datasetId: "espr-al-2027", requiredBy: "2027-02-01", priority: 50, linkedCaseId: "SRC-184846" }),
    req({ id: "req-textile-recycled", subjectId: "TEXTILE-04", subjectLabel: "Textile", productIds: ["urban-chair-04"], propertyId: "recycled_content", propertyLabel: "Textile recycled content", datasetId: "espr-al-2027", requiredBy: "2027-02-01", priority: 92, linkedCaseId: "SRC-184847" }),
    req({ id: "req-casting", subjectId: "CAST-11", subjectLabel: "Casting", productIds: ["lounge-11"], propertyId: "recycled_content", propertyLabel: "Casting recycled content", datasetId: "espr-al-2027", requiredBy: "2027-02-01", priority: 64, linkedCaseId: "SRC-184848" }),
    req({ id: "req-pack-carbon", subjectId: "PACK-02", subjectLabel: "Desk packaging", productIds: ["desk-02"], propertyId: "carbon_footprint", propertyLabel: "Packaging carbon footprint", datasetId: "espr-al-2027", requiredBy: "2027-02-01", priority: 40, linkedCaseId: "SRC-184849" }),
    req({ id: "req-wood", subjectId: "WOOD-07", subjectLabel: "Shelf board", productIds: ["shelf-07"], propertyId: "recycled_content", propertyLabel: "Wood recycled content", datasetId: "espr-al-2027", requiredBy: "2027-02-01", priority: 45, linkedCaseId: "SRC-184850" }),
    req({ id: "req-minerals", subjectId: "FASTEN-11", subjectLabel: "Fasteners", productIds: ["lounge-11"], propertyId: "conflict_minerals", propertyLabel: "Conflict minerals", datasetId: "espr-al-2027", requiredBy: "2027-02-01", priority: 30, linkedCaseId: "SRC-184851" }),
  ];

  state.cases = [
    resolution({ id: "SRC-184821", requirementId: "req-al-recycled", state: "MONITORING", currentActorId: "supplier-a", currentAttemptId: "att-al-1", nextAction: "Monitor evidence expiry.", nextActionAt: "2028-09-01T09:00:00.000Z", escalationPolicyId: STANDARD_SUPPLIER_14D.id, ownerLabel: "SOURCE", openedAt: "2026-08-12T09:00:00.000Z", closedAt: "2026-08-14T10:00:00.000Z", resolutionOutcome: "READY", version: 4, identityStatus: "IDENTITY_MATCHED", identityConfidence: 99.7, requestId: "req-al", productId: "urban-chair-04", supplierId: "supplier-a", automationLevel: "L3", portalToken: "demo", downstreamSyncOffered: true, downstreamUsages: ["DPP"] }),
    resolution({ id: "SRC-184830", requirementId: "req-textile-origin", state: "WAITING_RESPONSE", currentActorId: "supplier-b", currentAttemptId: "att-tex-2", blockingReason: "NO_RESPONSE", blockingExplanation: "The request was delivered but nobody has answered yet.", nextAction: "Automatic reminder", nextActionAt: "2026-08-20T09:00:00.000Z", escalationPolicyId: STANDARD_SUPPLIER_14D.id, ownerLabel: "John — Procurement", openedAt: "2026-07-30T09:00:00.000Z", version: 3, identityStatus: "IDENTITY_MATCHED", identityConfidence: 88.4, requestId: "req-tex", productId: "urban-chair-04", supplierId: "supplier-b", portalToken: "textile", automationLevel: "L2" }),
    resolution({ id: "SRC-184831", requirementId: "req-pack-recycled", state: "AUTHORIZATION_REQUIRED", currentActorId: "supplier-a", blockingReason: "AUTHORIZATION_REQUIRED", blockingExplanation: "A reusable claim exists. One authorization is still required.", nextAction: "Ask the supplier for a one-click grant.", nextActionAt: "2026-08-18T09:00:00.000Z", escalationPolicyId: STANDARD_SUPPLIER_14D.id, ownerLabel: "SOURCE", identityStatus: "IDENTITY_MATCHED", identityConfidence: 99.1, productId: "urban-chair-04", supplierId: "supplier-a", portalToken: "packaging", requestId: "req-pack" }),
    resolution({ id: "SRC-184832", requirementId: "req-fastener-cert", state: "RENEWAL_REQUIRED", currentActorId: "supplier-b", blockingReason: "EVIDENCE_EXPIRED", blockingExplanation: "The claim is kept for history. Readiness is recalculated.", nextAction: "Request replacement evidence.", nextActionAt: "2026-08-24T09:00:00.000Z", escalationPolicyId: STANDARD_SUPPLIER_14D.id, ownerLabel: "SOURCE", identityStatus: "IDENTITY_MATCHED", identityConfidence: 97, productId: "urban-chair-04", supplierId: "supplier-b", portalToken: "fasteners" }),
    resolution({ id: "SRC-184840", requirementId: "req-trader-origin", state: "CONTACT_REQUIRED", currentActorId: "trader-x", blockingReason: "BOUNCED", blockingExplanation: "Mail to the current contact was undeliverable.", nextAction: "Account owner supplies a working contact.", nextActionAt: "2026-08-18T09:00:00.000Z", escalationPolicyId: STANDARD_SUPPLIER_14D.id, ownerLabel: "Account owner", identityStatus: "IDENTITY_MATCHED", identityConfidence: 91, productId: "lounge-11", supplierId: "trader-x", portalToken: "trader", requestId: "req-trader", automationLevel: "L0" }),
    resolution({ id: "SRC-184841", requirementId: "req-wrong-contact", state: "WAITING_RESPONSE", currentActorId: "supplier-b", blockingReason: "WRONG_CONTACT", blockingExplanation: "The recipient said they cannot answer this request.", nextAction: "Same scoped request continues to the new person.", nextActionAt: "2026-08-19T09:00:00.000Z", escalationPolicyId: STANDARD_SUPPLIER_14D.id, ownerLabel: "SOURCE", identityStatus: "IDENTITY_MATCHED", identityConfidence: 88.4, productId: "shelf-07", supplierId: "supplier-b", portalToken: "wrong-contact", requestId: "req-wrong" }),
    resolution({ id: "SRC-184842", requirementId: "req-unknown", state: "WAITING_RESPONSE", currentActorId: "furnco", blockingReason: "UNKNOWN", blockingExplanation: "They can ask their supplier, assign a colleague, or say the information does not exist.", nextAction: "Choose the next owner of the answer.", nextActionAt: "2026-08-19T09:00:00.000Z", escalationPolicyId: STANDARD_SUPPLIER_14D.id, ownerLabel: "SOURCE", identityStatus: "IDENTITY_MATCHED", identityConfidence: 99.2, productId: "desk-02", supplierId: "furnco", portalToken: "unknown", requestId: "req-foam" }),
    resolution({ id: "SRC-184843", requirementId: "req-yarn", state: "WAITING_UPSTREAM", currentActorId: "mill-north", blockingReason: "UPSTREAM_REQUIRED", blockingExplanation: "The current supplier cannot provide this and asked their material supplier.", nextAction: "Wait for the upstream attempt. Do not open a second requirement.", nextActionAt: "2026-08-22T09:00:00.000Z", escalationPolicyId: STANDARD_SUPPLIER_14D.id, ownerLabel: "SOURCE", identityStatus: "IDENTITY_MATCHED", identityConfidence: 88.4, productId: "urban-chair-04", supplierId: "supplier-b", portalToken: "yarn", requestId: "req-yarn" }),
    resolution({ id: "SRC-184844", requirementId: "req-dye", state: "WAITING_UPSTREAM", currentActorId: "mill-north", blockingReason: "CONFIDENTIAL", blockingExplanation: "A derived claim may still become ready. The manufacturer must not see the hidden actor.", nextAction: "Continue collection under the access policy.", nextActionAt: "2026-08-22T09:00:00.000Z", escalationPolicyId: STANDARD_SUPPLIER_14D.id, ownerLabel: "SOURCE", identityStatus: "IDENTITY_MATCHED", identityConfidence: 88.4, productId: "urban-chair-04", supplierId: "supplier-b", portalToken: "dye", requestId: "req-dye" }),
    resolution({ id: "SRC-184845", requirementId: "req-reach", state: "NDA_REQUIRED", currentActorId: "supplier-a", blockingReason: "DECLINED", blockingExplanation: "Commercially confidential. SOURCE will not pretend the data exists.", nextAction: "Confirm whether an agreement already exists, then resume.", nextActionAt: "2026-08-21T09:00:00.000Z", escalationPolicyId: STANDARD_SUPPLIER_14D.id, ownerLabel: "Tenant owner", identityStatus: "IDENTITY_MATCHED", identityConfidence: 99.8, productId: "lounge-11", supplierId: "supplier-a", portalToken: "reach", requestId: "req-reach", automationLevel: "L1" }),
    resolution({ id: "SRC-184846", requirementId: "req-steel", state: "EVIDENCE_REQUIRED", currentActorId: "supplier-a", blockingReason: "EVIDENCE_MISSING", blockingExplanation: "The dataset requires evidenced trust. Declared is not enough.", nextAction: "Request a document, or keep the case open.", nextActionAt: "2026-08-20T09:00:00.000Z", escalationPolicyId: STANDARD_SUPPLIER_14D.id, ownerLabel: "SOURCE", identityStatus: "IDENTITY_MATCHED", identityConfidence: 99.8, productId: "shelf-07", supplierId: "supplier-a", portalToken: "steel", requestId: "req-steel" }),
    resolution({ id: "SRC-184847", requirementId: "req-textile-recycled", state: "CONFLICT", currentActorId: "supplier-b", blockingReason: "VALUE_EVIDENCE_CONFLICT", blockingExplanation: "Declared 67% vs extracted 42%. SOURCE will not choose automatically.", nextAction: "Adjudicate before any downstream sync.", nextActionAt: "2026-08-18T09:00:00.000Z", escalationPolicyId: STANDARD_SUPPLIER_14D.id, ownerLabel: "Evidence reviewer", identityStatus: "IDENTITY_MATCHED", identityConfidence: 88.4, productId: "urban-chair-04", supplierId: "supplier-b", portalToken: "conflict", requestId: "req-tex-rec", downstreamSyncBlocked: true }),
    resolution({ id: "SRC-184848", requirementId: "req-casting", state: "IDENTITY_REVIEW", currentActorId: undefined, blockingReason: "IDENTITY_AMBIGUOUS", blockingExplanation: "Two probable supplier matches. Evidence must not auto-link.", nextAction: "Confirm whether Acme Aluminium GmbH is SUP-4471.", nextActionAt: "2026-08-18T09:00:00.000Z", escalationPolicyId: STANDARD_SUPPLIER_14D.id, ownerLabel: "Identity reviewer", identityStatus: "IDENTITY_AMBIGUOUS", identityConfidence: 91, productId: "lounge-11", supplierId: undefined, portalToken: "identity", automationLevel: "L0" }),
    resolution({ id: "SRC-184849", requirementId: "req-pack-carbon", state: "PERMISSION_CHECK", currentActorId: "furnco", blockingReason: "PERMISSION_DENIED", blockingExplanation: "Evidence exists, but it cannot currently be used by your organisation.", nextAction: "Request authorization or accept a verification-only result.", nextActionAt: "2026-08-19T09:00:00.000Z", escalationPolicyId: STANDARD_SUPPLIER_14D.id, ownerLabel: "SOURCE", identityStatus: "IDENTITY_MATCHED", identityConfidence: 99.2, productId: "desk-02", supplierId: "furnco", portalToken: "carbon", requestId: "req-carbon" }),
    resolution({ id: "SRC-184850", requirementId: "req-wood", state: "WAITING_RESPONSE", currentActorId: "supplier-a", blockingReason: "NO_RESPONSE", blockingExplanation: "Reminders exhausted. Procurement owns the next call.", nextAction: "Procurement follows up with the supplier.", nextActionAt: "2026-08-19T09:00:00.000Z", escalationPolicyId: STANDARD_SUPPLIER_14D.id, ownerLabel: "John — Procurement", identityStatus: "IDENTITY_MATCHED", identityConfidence: 99.8, productId: "shelf-07", supplierId: "supplier-a", portalToken: "wood", requestId: "req-wood", automationLevel: "L0" }),
    resolution({ id: "SRC-184851", requirementId: "req-minerals", state: "UNRESOLVED", currentActorId: "supplier-a", blockingReason: "UNRESOLVABLE", blockingExplanation: "Nobody in the chain possesses this information. Attempts exhausted.", nextAction: "Remaining options: public evidence, a different actor, or accept a dataset gap.", nextActionAt: undefined, escalationPolicyId: STANDARD_SUPPLIER_14D.id, ownerLabel: "Compliance", identityStatus: "IDENTITY_MATCHED", identityConfidence: 99.8, productId: "lounge-11", supplierId: "supplier-a", portalToken: "minerals", requestId: "req-minerals", resolutionOutcome: "UNRESOLVED", closedAt: "2026-08-16T16:00:00.000Z", automationLevel: "L0" }),
  ];

  const attempt = (row: ResolutionAttempt): ResolutionAttempt => row;
  state.attempts = [
    attempt({ id: "att-al-1", caseId: "SRC-184821", actorId: "supplier-a", method: "email_request", status: "succeeded", startedAt: "2026-08-12T09:00:00.000Z", completedAt: "2026-08-14T10:00:00.000Z", responseType: "value_and_evidence", costEstimate: 2.4, requestId: "req-al" }),
    attempt({ id: "att-tex-1", caseId: "SRC-184830", actorId: "supplier-b", method: "email_request", status: "waiting", startedAt: "2026-07-30T09:00:00.000Z", costEstimate: 2.4, requestId: "req-tex" }),
    attempt({ id: "att-tex-2", caseId: "SRC-184830", actorId: "supplier-b", method: "email_request", status: "waiting", startedAt: "2026-08-02T09:00:00.000Z", costEstimate: 0.01, requestId: "req-tex" }),
    attempt({ id: "att-pack", caseId: "SRC-184831", actorId: "supplier-a", method: "authorization", status: "waiting", startedAt: "2026-08-15T09:00:00.000Z", costEstimate: 0.01 }),
    attempt({ id: "att-fast", caseId: "SRC-184832", actorId: "supplier-b", method: "renewal", status: "open", startedAt: "2026-08-16T09:00:00.000Z", costEstimate: 0.01 }),
    attempt({ id: "att-trader", caseId: "SRC-184840", actorId: "trader-x", method: "email_request", status: "failed", startedAt: "2026-08-10T09:00:00.000Z", costEstimate: 2.4, requestId: "req-trader" }),
    attempt({ id: "att-wrong", caseId: "SRC-184841", actorId: "supplier-b", method: "email_request", status: "superseded", startedAt: "2026-08-11T09:00:00.000Z", costEstimate: 2.4, requestId: "req-wrong" }),
    attempt({ id: "att-foam", caseId: "SRC-184842", actorId: "furnco", method: "email_request", status: "waiting", startedAt: "2026-08-12T09:00:00.000Z", costEstimate: 2.4, requestId: "req-foam" }),
    attempt({ id: "att-yarn-1", caseId: "SRC-184843", actorId: "supplier-b", method: "email_request", status: "forwarded", startedAt: "2026-08-08T09:00:00.000Z", completedAt: "2026-08-13T09:00:00.000Z", forwardedUpstream: true, costEstimate: 2.4, requestId: "req-yarn" }),
    attempt({ id: "att-yarn-2", caseId: "SRC-184843", actorId: "mill-north", method: "upstream_request", status: "waiting", startedAt: "2026-08-13T09:00:00.000Z", parentAttemptId: "att-yarn-1", forwardedUpstream: true, costEstimate: 2.4 }),
    attempt({ id: "att-dye-1", caseId: "SRC-184844", actorId: "supplier-b", method: "email_request", status: "forwarded", startedAt: "2026-08-08T09:00:00.000Z", forwardedUpstream: true, costEstimate: 2.4 }),
    attempt({ id: "att-dye-2", caseId: "SRC-184844", actorId: "mill-north", method: "upstream_request", status: "waiting", startedAt: "2026-08-13T11:00:00.000Z", parentAttemptId: "att-dye-1", forwardedUpstream: true, costEstimate: 2.4 }),
    attempt({ id: "att-reach", caseId: "SRC-184845", actorId: "supplier-a", method: "email_request", status: "failed", startedAt: "2026-08-09T09:00:00.000Z", responseType: "declined", costEstimate: 2.4 }),
    attempt({ id: "att-steel", caseId: "SRC-184846", actorId: "supplier-a", method: "email_request", status: "waiting", startedAt: "2026-08-14T09:00:00.000Z", responseType: "declared", costEstimate: 2.4 }),
    attempt({ id: "att-conflict", caseId: "SRC-184847", actorId: "supplier-b", method: "ai_extraction", status: "failed", startedAt: "2026-08-15T09:00:00.000Z", costEstimate: 0.35 }),
    attempt({ id: "att-id", caseId: "SRC-184848", actorId: "acme", method: "human_review", status: "open", startedAt: "2026-08-16T09:00:00.000Z", costEstimate: 12 }),
    attempt({ id: "att-carbon", caseId: "SRC-184849", actorId: "furnco", method: "email_request", status: "succeeded", startedAt: "2026-08-10T09:00:00.000Z", responseType: "permission_denied", costEstimate: 2.4 }),
    attempt({ id: "att-wood-esc", caseId: "SRC-184850", actorId: "supplier-a", method: "procurement_escalation", status: "open", startedAt: "2026-08-16T09:00:00.000Z", costEstimate: 18 }),
    attempt({ id: "att-min", caseId: "SRC-184851", actorId: "supplier-a", method: "email_request", status: "failed", startedAt: "2026-07-20T09:00:00.000Z", responseType: "unavailable", costEstimate: 2.4 }),
  ];

  const request = (row: SupplierRequest): SupplierRequest => row;
  state.requests = [
    request({ id: "req-al", caseId: "SRC-184821", supplierId: "supplier-a", supplierName: "Supplier A", status: "COMPLETED", sentAt: "2026-08-12T09:00:00.000Z", dueAt: "2026-08-26T09:00:00.000Z", lastActivityAt: "2026-08-14T10:00:00.000Z", reminderCount: 0, executedEscalationActions: ["send"], portalToken: "demo" }),
    request({ id: "req-tex", caseId: "SRC-184830", supplierId: "supplier-b", supplierName: "Supplier B", status: "NO_RESPONSE", sentAt: "2026-07-30T09:00:00.000Z", dueAt: "2026-08-13T09:00:00.000Z", lastActivityAt: "2026-08-02T09:00:00.000Z", reminderCount: 1, executedEscalationActions: ["send", "friendly_reminder"], portalToken: "textile" }),
    request({ id: "req-pack", caseId: "SRC-184831", supplierId: "supplier-a", supplierName: "Supplier A", status: "COMPLETED", sentAt: "2026-08-12T09:00:00.000Z", dueAt: "2026-08-26T09:00:00.000Z", lastActivityAt: "2026-08-15T09:00:00.000Z", reminderCount: 0, executedEscalationActions: ["send"], portalToken: "packaging" }),
    request({ id: "req-trader", caseId: "SRC-184840", supplierId: "trader-x", supplierName: "TradeLink Agents", status: "BOUNCED", sentAt: "2026-08-10T09:00:00.000Z", dueAt: "2026-08-24T09:00:00.000Z", lastActivityAt: "2026-08-10T09:12:00.000Z", reminderCount: 0, executedEscalationActions: ["send"], portalToken: "trader", contactId: "ct-trader-old" }),
    request({ id: "req-wrong", caseId: "SRC-184841", supplierId: "supplier-b", supplierName: "Supplier B", status: "WRONG_CONTACT", sentAt: "2026-08-11T09:00:00.000Z", dueAt: "2026-08-25T09:00:00.000Z", lastActivityAt: "2026-08-16T09:00:00.000Z", reminderCount: 0, executedEscalationActions: ["send"], portalToken: "wrong-contact", contactId: "ct-b-gen" }),
    request({ id: "req-foam", caseId: "SRC-184842", supplierId: "furnco", supplierName: "FurnCo", status: "UNKNOWN_INFORMATION", sentAt: "2026-08-12T09:00:00.000Z", dueAt: "2026-08-26T09:00:00.000Z", lastActivityAt: "2026-08-16T12:00:00.000Z", reminderCount: 0, executedEscalationActions: ["send"], portalToken: "unknown" }),
    request({ id: "req-yarn", caseId: "SRC-184843", supplierId: "supplier-b", supplierName: "Supplier B", status: "NEEDS_UPSTREAM", sentAt: "2026-08-08T09:00:00.000Z", dueAt: "2026-08-22T09:00:00.000Z", lastActivityAt: "2026-08-13T09:00:00.000Z", reminderCount: 0, executedEscalationActions: ["send"], portalToken: "yarn" }),
    request({ id: "req-dye", caseId: "SRC-184844", supplierId: "supplier-b", supplierName: "Supplier B", status: "CONFIDENTIAL", sentAt: "2026-08-08T09:00:00.000Z", dueAt: "2026-08-22T09:00:00.000Z", lastActivityAt: "2026-08-13T11:00:00.000Z", reminderCount: 0, executedEscalationActions: ["send"], portalToken: "dye" }),
    request({ id: "req-reach", caseId: "SRC-184845", supplierId: "supplier-a", supplierName: "Supplier A", status: "DECLINED", sentAt: "2026-08-09T09:00:00.000Z", dueAt: "2026-08-23T09:00:00.000Z", lastActivityAt: "2026-08-12T09:00:00.000Z", reminderCount: 0, executedEscalationActions: ["send"], portalToken: "reach" }),
    request({ id: "req-steel", caseId: "SRC-184846", supplierId: "supplier-a", supplierName: "Supplier A", status: "PARTIAL", sentAt: "2026-08-14T09:00:00.000Z", dueAt: "2026-08-28T09:00:00.000Z", lastActivityAt: "2026-08-15T09:00:00.000Z", reminderCount: 0, executedEscalationActions: ["send"], portalToken: "steel" }),
    request({ id: "req-tex-rec", caseId: "SRC-184847", supplierId: "supplier-b", supplierName: "Supplier B", status: "SUBMITTED", sentAt: "2026-08-12T09:00:00.000Z", dueAt: "2026-08-26T09:00:00.000Z", lastActivityAt: "2026-08-15T09:00:00.000Z", reminderCount: 0, executedEscalationActions: ["send"], portalToken: "conflict" }),
    request({ id: "req-carbon", caseId: "SRC-184849", supplierId: "furnco", supplierName: "FurnCo", status: "COMPLETED", sentAt: "2026-08-10T09:00:00.000Z", dueAt: "2026-08-24T09:00:00.000Z", lastActivityAt: "2026-08-14T09:00:00.000Z", reminderCount: 0, executedEscalationActions: ["send"], portalToken: "carbon" }),
    request({ id: "req-wood", caseId: "SRC-184850", supplierId: "supplier-a", supplierName: "Supplier A", status: "NO_RESPONSE", sentAt: "2026-07-27T09:00:00.000Z", dueAt: "2026-08-10T09:00:00.000Z", lastActivityAt: "2026-08-16T09:00:00.000Z", reminderCount: 3, executedEscalationActions: ["send", "friendly_reminder", "reminder_due", "secondary_contact", "escalate_procurement"], portalToken: "wood" }),
    request({ id: "req-minerals", caseId: "SRC-184851", supplierId: "supplier-a", supplierName: "Supplier A", status: "DECLINED", sentAt: "2026-07-20T09:00:00.000Z", dueAt: "2026-08-03T09:00:00.000Z", lastActivityAt: "2026-08-16T16:00:00.000Z", reminderCount: 2, executedEscalationActions: ["send", "friendly_reminder", "mark_non_responsive"], portalToken: "minerals" }),
  ];

  state.claims = [
    { id: "claim-recycled-al", requirementId: "req-al-recycled", caseId: "SRC-184821", propertyId: "recycled_content", value: "67", unit: "%", subjectId: "AL-FRAME-881", productId: "urban-chair-04", declaredByActorId: "supplier-a", evidenceId: "ev-92831", validUntil: "2028-12-31", trustLevel: "VERIFIED", permissionState: "GRANTED", purpose: "DPP_COMPLIANCE", identityConfidence: 99.7, ready: true, downstreamTargets: ["DPP"] },
    { id: "claim-packaging-recycled", requirementId: "req-pack-recycled", caseId: "SRC-184831", propertyId: "recycled_content", value: "42", unit: "%", subjectId: "PACK-04", productId: "urban-chair-04", declaredByActorId: "supplier-a", evidenceId: "ev-44102", validUntil: "2027-03-01", trustLevel: "EVIDENCED", permissionState: "REQUEST_REQUIRED", purpose: "DPP_COMPLIANCE", identityConfidence: 99.1, ready: false },
    { id: "claim-fastener", requirementId: "req-fastener-cert", caseId: "SRC-184832", propertyId: "iso14021_certificate", value: "ISO 14021", subjectId: "FASTEN-04", productId: "urban-chair-04", declaredByActorId: "supplier-b", evidenceId: "ev-expiring", validUntil: "2026-09-09", trustLevel: "EVIDENCED", permissionState: "GRANTED", purpose: "DPP_COMPLIANCE", identityConfidence: 97, ready: false },
    { id: "claim-steel-declared", requirementId: "req-steel", caseId: "SRC-184846", propertyId: "recycled_content", value: "67", unit: "%", subjectId: "STEEL-07", productId: "shelf-07", declaredByActorId: "supplier-a", trustLevel: "DECLARED", permissionState: "GRANTED", purpose: "DPP_COMPLIANCE", identityConfidence: 99.8, ready: false, extractionProvenance: "declared_by_supplier" },
    { id: "claim-textile-recycled", requirementId: "req-textile-recycled", caseId: "SRC-184847", propertyId: "recycled_content", value: "67", unit: "%", subjectId: "TEXTILE-04", productId: "urban-chair-04", declaredByActorId: "supplier-b", evidenceId: "ev-tex-conflict", trustLevel: "DECLARED", permissionState: "GRANTED", purpose: "DPP_COMPLIANCE", identityConfidence: 88.4, ready: false, extractionProvenance: "declared_by_supplier" },
    { id: "claim-carbon", requirementId: "req-pack-carbon", caseId: "SRC-184849", propertyId: "carbon_footprint", value: "1.8", unit: "kgCO2e", subjectId: "PACK-02", productId: "desk-02", declaredByActorId: "furnco", evidenceId: "ev-carbon", trustLevel: "EVIDENCED", permissionState: "DENIED", purpose: "DPP_COMPLIANCE", identityConfidence: 99.2, ready: false },
  ];

  state.evidence = [
    { id: "ev-92831", filename: "cert-92831.pdf", sha256: "a9f3c1e8b2d74f01c6e5a0b8d3f27c91e4b6a1d0c8f5e2b7a3d9c4e1f6b8a2d5", issuer: "Accredited certifier", ownerActorId: "supplier-a", validUntil: "2028-12-31", expired: false, scope: { kind: "product", id: "AL-FRAME-881", label: "AL-FRAME-881" }, visibility: "public", linkedClaimIds: ["claim-recycled-al"] },
    { id: "ev-44102", filename: "packaging-lca-2026.pdf", sha256: "c1b8e4a0d7f32e19a6c5b8d1f4e7a0c3b6d9e2f5a8c1d4e7b0a3c6f9d2e5a8b1", issuer: "Supplier A", ownerActorId: "supplier-a", validUntil: "2027-03-01", expired: false, scope: { kind: "product", id: "PACK-04", label: "PACK-04" }, visibility: "private", linkedClaimIds: ["claim-packaging-recycled"] },
    { id: "ev-expiring", filename: "iso14021-fasteners.pdf", sha256: "d4e7a1c8f0b3e6a9d2c5f8b1e4a7c0d3f6a9b2e5c8d1f4a7b0e3c6d9f2a5b8c1", issuer: "TÜV", ownerActorId: "supplier-b", validUntil: "2026-09-09", expired: false, scope: { kind: "product", id: "FASTEN-04", label: "FASTEN-04" }, visibility: "public", linkedClaimIds: ["claim-fastener"] },
    { id: "ev-tex-conflict", filename: "textile-epd.pdf", sha256: "e1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2", issuer: "EPD operator", ownerActorId: "supplier-b", validUntil: "2027-01-01", expired: false, scope: { kind: "facility", id: "mill-avg", label: "Factory average" }, visibility: "private", linkedClaimIds: ["claim-textile-recycled"], extractedValue: "42", extractionConfidence: 94 },
    { id: "ev-carbon", filename: "pack-carbon-lca.pdf", sha256: "f0e1d2c3b4a5968778695a4b3c2d1e0f1a2b3c4d5e6f708192a3b4c5d6e7f809", issuer: "FurnCo", ownerActorId: "furnco", validUntil: "2027-06-01", expired: false, scope: { kind: "product", id: "PACK-02", label: "PACK-02" }, visibility: "private", linkedClaimIds: ["claim-carbon"] },
  ];

  state.permissions = [
    { id: "perm-al", claimId: "claim-recycled-al", evidenceId: "ev-92831", granteeActorId: "acme", purpose: "DPP_COMPLIANCE", state: "GRANTED", visibility: "value", createdAt: "2026-08-14T10:00:00.000Z" },
    { id: "perm-pack", claimId: "claim-packaging-recycled", evidenceId: "ev-44102", granteeActorId: "acme", purpose: "DPP_COMPLIANCE", state: "REQUEST_REQUIRED", visibility: "value", createdAt: "2026-08-15T09:00:00.000Z" },
    { id: "perm-carbon", claimId: "claim-carbon", evidenceId: "ev-carbon", granteeActorId: "acme", purpose: "DPP_COMPLIANCE", state: "DENIED", visibility: "restricted", createdAt: "2026-08-14T09:00:00.000Z" },
  ];

  state.conflicts = [
    { id: "cf-tex", caseId: "SRC-184847", claimId: "claim-textile-recycled", leftLabel: "Declared value", leftValue: "67%", rightLabel: "textile-epd.pdf", rightValue: "42%" },
  ];

  state.tasks = [
    { id: "task-id", caseId: "SRC-184848", title: "Confirm whether Acme Aluminium GmbH is SUP-4471.", context: "Imported as Acme Aluminium. Candidate Acme Aluminium GmbH · Germany · VAT DE811128135 · 91%.", recommendedAction: "Confirm, reject, create new, merge or split. Do not auto-link evidence.", ownerLabel: "Identity reviewer", status: "open", createdAt: "2026-08-16T09:00:00.000Z", kind: "identity" },
    { id: "task-conflict", caseId: "SRC-184847", title: "Two certificates conflict. Select applicable facility.", context: "Declared 67% vs EPD 42%. Factory average is not automatically a product claim.", recommendedAction: "Choose different scope, facility, batch, methodology — or withdraw evidence.", ownerLabel: "Evidence reviewer", status: "open", createdAt: "2026-08-15T09:00:00.000Z", kind: "conflict" },
    { id: "task-bounce", caseId: "SRC-184840", title: "Find a working contact for TradeLink Agents.", context: "ops@tradelink.invalid bounced. SOURCE stopped waiting for the deadline.", recommendedAction: "Add a product-data or compliance mailbox.", ownerLabel: "Account owner", status: "open", createdAt: "2026-08-10T09:12:00.000Z", kind: "contact" },
    { id: "task-nda", caseId: "SRC-184845", title: "Supplier declined due to NDA. Confirm agreement exists.", context: "SOURCE does not assume an NDA exists.", recommendedAction: "Confirm agreement metadata, then resume disclosure.", ownerLabel: "Tenant owner", status: "open", createdAt: "2026-08-12T09:00:00.000Z", kind: "nda" },
    { id: "task-esc", caseId: "SRC-184850", title: "Supplier A has not responded on wood recycled content.", context: "Policy standard_supplier_14d reached procurement escalation.", recommendedAction: "Call the account contact or change the recipient.", ownerLabel: "John — Procurement", status: "open", createdAt: "2026-08-16T09:00:00.000Z", kind: "escalation" },
  ];

  state.exceptions = state.cases
    .filter((c) => c.blockingReason)
    .map((c, i) => ({
      id: `ex-seed-${i}`,
      caseId: c.id,
      code: c.blockingReason!,
      explanation: c.blockingExplanation ?? "",
      ownerLabel: c.ownerLabel ?? "SOURCE",
      nextAction: c.nextAction,
      automationPolicy: c.escalationPolicyId,
      escalationDeadline: c.nextActionAt ?? NOW,
      createdAt: c.openedAt,
    }));

  state.dependencies = [
    { id: "dep-al-dpp", claimId: "claim-recycled-al", target: "DPP", status: "active" },
    { id: "dep-al-erp", claimId: "claim-recycled-al", target: "ERP", status: "active" },
  ];

  state.events = [
    { id: "evt-1", caseId: "SRC-184821", type: "request.sent", actor: "SOURCE_SYSTEM", timestamp: "2026-08-12T09:00:00.000Z", policy: "standard_supplier_14d", policyVersion: "1.0", detail: "Request sent to Supplier A." },
    { id: "evt-2", caseId: "SRC-184821", type: "evidence.uploaded", actor: "supplier-a", timestamp: "2026-08-14T09:40:00.000Z", detail: "cert-92831.pdf" },
    { id: "evt-3", caseId: "SRC-184821", type: "case.ready", actor: "SOURCE_SYSTEM", timestamp: "2026-08-14T10:00:00.000Z", detail: "Supplier provided value, evidence and permission." },
    { id: "evt-4", caseId: "SRC-184830", type: "request.sent", actor: "SOURCE_SYSTEM", timestamp: "2026-07-30T09:00:00.000Z", policy: "standard_supplier_14d", policyVersion: "1.0", detail: "Request sent to Supplier B." },
    { id: "evt-5", caseId: "SRC-184830", type: "AUTO_REMINDER_SENT", actor: "SOURCE_SYSTEM", timestamp: "2026-08-02T09:00:00.000Z", policy: "standard_supplier_14d", policyVersion: "1.0", detail: "Automatic friendly reminder according to standard_supplier_14d.", payload: { trigger: "3 days no response", action: "friendly_reminder" } },
    { id: "evt-6", caseId: "SRC-184840", type: "request.bounced", actor: "SOURCE_SYSTEM", timestamp: "2026-08-10T09:12:00.000Z", detail: "Contact marked invalid after bounce." },
    { id: "evt-7", caseId: "SRC-184841", type: "request.forwarded", actor: "ct-b-gen", timestamp: "2026-08-16T09:00:00.000Z", detail: "Wrong contact. Original recipient remains in audit history." },
    { id: "evt-8", caseId: "SRC-184843", type: "request.forwarded", actor: "supplier-b", timestamp: "2026-08-13T09:00:00.000Z", detail: "Forwarded upstream. Same InformationRequirement." },
    { id: "evt-9", caseId: "SRC-184844", type: "request.forwarded", actor: "supplier-b", timestamp: "2026-08-13T11:00:00.000Z", detail: "Forwarded upstream with identity protected.", payload: { confidential: true, hideCustomer: true } },
    { id: "evt-10", caseId: "SRC-184847", type: "claim.conflict_detected", actor: "SOURCE_SYSTEM", timestamp: "2026-08-15T09:00:00.000Z", detail: "Declared 67% vs evidence 42%." },
    { id: "evt-11", caseId: "SRC-184848", type: "identity.review_required", actor: "SOURCE_SYSTEM", timestamp: "2026-08-16T09:00:00.000Z", detail: "Two probable matches. Evidence will not be auto-linked." },
    { id: "evt-12", caseId: "SRC-184851", type: "case.unresolved", actor: "SOURCE_SYSTEM", timestamp: "2026-08-16T16:00:00.000Z", detail: "Nobody in the chain possesses this information." },
    { id: "evt-13", caseId: "SRC-184850", type: "case.escalated", actor: "SOURCE_SYSTEM", timestamp: "2026-08-16T09:00:00.000Z", policy: "standard_supplier_14d", detail: "Escalated to procurement owner." },
  ];

  state.subjects = [
    { id: "urban-chair-04", kind: "PRODUCT", name: "Urban Chair 04", createdAt: "2026-08-01T09:00:00.000Z", source: "IMPORTED", sourceReference: "products.xlsx" },
    { id: "AL-FRAME-881", kind: "COMPONENT", name: "Aluminium Frame", createdAt: "2026-08-01T09:00:00.000Z", source: "IMPORTED" },
    { id: "ALU-6061", kind: "MATERIAL", name: "Aluminium 6061", createdAt: "2026-08-01T09:00:00.000Z", source: "AUTO_DETECTED", confidence: 92 },
    { id: "TEXTILE-04", kind: "COMPONENT", name: "Textile", createdAt: "2026-08-01T09:00:00.000Z", source: "IMPORTED" },
    { id: "PACK-04", kind: "PACKAGING", name: "Packaging", createdAt: "2026-08-01T09:00:00.000Z", source: "IMPORTED" },
    { id: "FASTEN-04", kind: "COMPONENT", name: "Fasteners", createdAt: "2026-08-01T09:00:00.000Z", source: "IMPORTED" },
  ];
  state.subjectRelationships = [
    { id: "srel-1", parentSubjectId: "urban-chair-04", childSubjectId: "AL-FRAME-881", source: "IMPORTED", createdAt: "2026-08-01T09:00:00.000Z" },
    { id: "srel-2", parentSubjectId: "AL-FRAME-881", childSubjectId: "ALU-6061", source: "AUTO_DETECTED", createdAt: "2026-08-01T09:00:00.000Z", confidence: 92 },
    { id: "srel-3", parentSubjectId: "urban-chair-04", childSubjectId: "TEXTILE-04", source: "IMPORTED", createdAt: "2026-08-01T09:00:00.000Z" },
    { id: "srel-4", parentSubjectId: "urban-chair-04", childSubjectId: "PACK-04", source: "IMPORTED", createdAt: "2026-08-01T09:00:00.000Z" },
    { id: "srel-5", parentSubjectId: "urban-chair-04", childSubjectId: "FASTEN-04", source: "IMPORTED", createdAt: "2026-08-01T09:00:00.000Z" },
  ];
  state.subjectIdentifiers = [
    { id: "sid-1", canonicalSubjectId: "urban-chair-04", scheme: "SKU", value: "URBAN-CHAIR-04" },
    { id: "sid-2", canonicalSubjectId: "urban-chair-04", scheme: "GTIN", value: "8712345678901" },
    { id: "sid-3", canonicalSubjectId: "AL-FRAME-881", scheme: "MPN", value: "ALF881" },
    { id: "sid-4", canonicalSubjectId: "AL-FRAME-881", scheme: "SKU", value: "FR-1288" },
  ];
  state.tenantSubjectMappings = [
    {
      id: "map-1",
      tenantId: "acme",
      sourceSystem: "erp",
      sourceRecordId: "FR-1288",
      canonicalSubjectId: "AL-FRAME-881",
      matchMethod: "deterministic",
      confidence: 99,
      decision: "auto",
      modelVersion: "heuristic-v0",
      createdAt: "2026-08-01T09:00:00.000Z",
    },
  ];

  return state;
}

export const MVP_FLOWS = [
  { code: "NO_RESPONSE", caseId: "SRC-184830" },
  { code: "WRONG_CONTACT", caseId: "SRC-184841" },
  { code: "UNKNOWN", caseId: "SRC-184842" },
  { code: "UPSTREAM_REQUIRED", caseId: "SRC-184843" },
  { code: "CONFIDENTIAL", caseId: "SRC-184844" },
  { code: "DECLINED", caseId: "SRC-184845" },
  { code: "EVIDENCE_MISSING", caseId: "SRC-184846" },
  { code: "EVIDENCE_EXPIRED", caseId: "SRC-184832" },
  { code: "VALUE_EVIDENCE_CONFLICT", caseId: "SRC-184847" },
  { code: "IDENTITY_AMBIGUOUS", caseId: "SRC-184848" },
  { code: "AUTHORIZATION_REQUIRED", caseId: "SRC-184831" },
  { code: "PERMISSION_DENIED", caseId: "SRC-184849" },
  { code: "BOUNCED", caseId: "SRC-184840" },
  { code: "NO_RESPONSE", caseId: "SRC-184850", note: "manual escalation" },
  { code: "UNRESOLVABLE", caseId: "SRC-184851" },
] as const;
