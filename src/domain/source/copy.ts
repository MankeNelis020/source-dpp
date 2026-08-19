import type { ExceptionCode, ResolutionCase, ResolutionCaseState } from "./types";

export interface ExceptionExplanation {
  code: ExceptionCode;
  headline: string;
  reason: string;
  nextAction: string;
  automationPolicy: string;
}

const EXCEPTIONS: Record<ExceptionCode, Omit<ExceptionExplanation, "code">> = {
  NO_RESPONSE: {
    headline: "Waiting for a supplier response.",
    reason: "The request was delivered but nobody has answered yet.",
    nextAction: "Send a reminder, try another contact, or escalate to procurement.",
    automationPolicy: "standard_supplier_14d",
  },
  BOUNCED: {
    headline: "The contact address bounced.",
    reason: "Mail to the current contact was undeliverable.",
    nextAction: "Mark the contact invalid and try another known address.",
    automationPolicy: "bounce_immediate",
  },
  WRONG_CONTACT: {
    headline: "This is not the right person.",
    reason: "The recipient said they cannot answer this request.",
    nextAction: "Forward internally or collect a better contact — same case continues.",
    automationPolicy: "contact_handoff",
  },
  UNKNOWN: {
    headline: "The supplier does not know this yet.",
    reason: "They can ask their supplier, assign a colleague, or say the information does not exist.",
    nextAction: "Choose the next owner of the answer.",
    automationPolicy: "unknown_branch",
  },
  UPSTREAM_REQUIRED: {
    headline: "The answer sits further upstream.",
    reason: "The current supplier cannot provide this and asked their material supplier.",
    nextAction: "Wait for the upstream attempt. Do not open a second requirement.",
    automationPolicy: "upstream_traversal",
  },
  DECLINED: {
    headline: "The supplier cannot provide this.",
    reason: "They gave an explicit reason. SOURCE will not pretend the data exists.",
    nextAction: "Route by reason: NDA, legal, commercial, or mark unresolvable.",
    automationPolicy: "decline_rules",
  },
  CONFIDENTIAL: {
    headline: "Upstream identity is protected.",
    reason: "A derived claim may still become ready. The manufacturer must not see the hidden actor.",
    nextAction: "Continue collection under the access policy.",
    automationPolicy: "relationship_visibility",
  },
  NDA_REQUIRED: {
    headline: "Disclosure is paused until an agreement is confirmed.",
    reason: "SOURCE does not assume an NDA exists.",
    nextAction: "Confirm agreement metadata, then resume.",
    automationPolicy: "nda_manual_confirm",
  },
  LEGAL_RESTRICTION: {
    headline: "Legal restriction blocks sharing.",
    reason: "The supplier cited a legal limit, not a missing value.",
    nextAction: "Review with legal / procurement. Do not auto-propagate.",
    automationPolicy: "legal_hold",
  },
  EVIDENCE_MISSING: {
    headline: "A value was declared without evidence.",
    reason: "The dataset requires evidenced trust. Declared is not enough.",
    nextAction: "Request a document, or keep the case open.",
    automationPolicy: "trust_gate",
  },
  EVIDENCE_EXPIRED: {
    headline: "Evidence has expired.",
    reason: "The claim is kept for history. Readiness is recalculated.",
    nextAction: "Start renewal before or at expiry according to policy.",
    automationPolicy: "renewal_90_60_30_7",
  },
  EVIDENCE_CONFLICT: {
    headline: "Conflicting evidence detected.",
    reason: "Two valid documents disagree. SOURCE will not pick the newest by default.",
    nextAction: "Adjudicate scope, facility, batch, methodology, or withdraw evidence.",
    automationPolicy: "conflict_hold",
  },
  SCOPE_MISMATCH: {
    headline: "Evidence does not cover this subject.",
    reason: "A factory average is not automatically a product claim.",
    nextAction: "Keep SCOPE_MISMATCH. Do not promote to verified.",
    automationPolicy: "scope_gate",
  },
  IDENTITY_AMBIGUOUS: {
    headline: "Supplier identity is not certain enough.",
    reason: "Evidence must not auto-link below the tenant confidence policy.",
    nextAction: "Confirm, reject, create new, merge, or split.",
    automationPolicy: "identity_review",
  },
  IDENTITY_CONFLICT: {
    headline: "Identity records conflict.",
    reason: "Two matched entities disagree. Precision wins.",
    nextAction: "Human merge/split. Collection may pause.",
    automationPolicy: "identity_review",
  },
  PERMISSION_DENIED: {
    headline: "Evidence exists, but it cannot currently be used by your organisation.",
    reason: "The permission gate failed. Completeness is not the same as access.",
    nextAction: "Request authorization or accept a verification-only result.",
    automationPolicy: "permission_gate",
  },
  PERMISSION_REVOKED: {
    headline: "Permission was withdrawn.",
    reason: "Future reuse is blocked. History stays. Downstream uses are flagged.",
    nextAction: "Notify affected organisations and re-collect if still required.",
    automationPolicy: "revocation_propagate",
  },
  AUTHORIZATION_REQUIRED: {
    headline: "A reusable claim exists. One authorization is still required.",
    reason: "SOURCE will not reuse silently.",
    nextAction: "Ask the supplier for a one-click grant.",
    automationPolicy: "reuse_authorization",
  },
  SOURCE_UNAVAILABLE: {
    headline: "The supplier is unreachable.",
    reason: "No valid contact remains, or the organisation no longer exists.",
    nextAction: "Task the account owner. Try domain contact if policy allows.",
    automationPolicy: "bounce_immediate",
  },
  ALLOCATION_UNKNOWN: {
    headline: "Multiple suppliers, unknown share.",
    reason: "SOURCE will not invent a weighted product claim.",
    nextAction: "Collect allocation, or keep claims at supplier scope.",
    automationPolicy: "allocation_hold",
  },
  CHAIN_CYCLE: {
    headline: "The supply chain loops back on itself.",
    reason: "A → B → C → A. No new request is sent.",
    nextAction: "Human review of relationships.",
    automationPolicy: "cycle_guard",
  },
  CONTACT_REQUIRED: {
    headline: "A working contact is required before SOURCE can ask.",
    reason: "The last address bounced or was marked invalid.",
    nextAction: "Account owner supplies a contact.",
    automationPolicy: "bounce_immediate",
  },
  EXTRACTION_REVIEW_REQUIRED: {
    headline: "We may have found this information.",
    reason: "Extraction confidence is too low to treat as a supplier declaration.",
    nextAction: "Human review. Provenance stays AI_EXTRACTED until confirmed.",
    automationPolicy: "extraction_review",
  },
  VALUE_EVIDENCE_CONFLICT: {
    headline: "The typed value and the document disagree.",
    reason: "SOURCE will not choose automatically.",
    nextAction: "Resolve the conflict before any downstream sync.",
    automationPolicy: "conflict_hold",
  },
  UNRESOLVABLE: {
    headline: "This could not be resolved automatically.",
    reason: "Every attempted route is exhausted or blocked by policy.",
    nextAction: "Keep the case as UNRESOLVED with remaining options.",
    automationPolicy: "terminal_unresolved",
  },
};

export function explainException(code: ExceptionCode): ExceptionExplanation {
  return { code, ...EXCEPTIONS[code] };
}

export function caseHeadline(resolution: ResolutionCase): string {
  if (resolution.blockingReason) return explainException(resolution.blockingReason).headline;
  if (resolution.state === "READY") return "Information resolved.";
  if (resolution.state === "MONITORING") return "Resolved. SOURCE will check this again before it expires.";
  return "SOURCE is still resolving this requirement.";
}

export function stateLabel(state: ResolutionCaseState): string {
  return state.replaceAll("_", " ").toLowerCase();
}

export const CORE_LOOP = [
  { id: "DETECT", title: "Detect", body: "Compare the required dataset with trusted data — not with non-empty fields." },
  { id: "RESOLVE", title: "Resolve", body: "Identify the subject and the actor before asking anyone." },
  { id: "COLLECT", title: "Collect", body: "Reuse first. Request only what is still missing." },
  { id: "ESCALATE", title: "Escalate", body: "No response, bounce, or wrong contact are normal states with a next action." },
  { id: "PROVE", title: "Prove", body: "Evidence is scoped, dated and conflict-checked. SOURCE does not pick a winner." },
  { id: "PERMIT", title: "Permit", body: "A technically perfect claim is still not ready without permission." },
  { id: "RETURN", title: "Return", body: "Output follows policy: approval, sync, batch, or API-only." },
  { id: "MAINTAIN", title: "Maintain", body: "Expiry, revocation and regulation change start a new resolution cycle." },
] as const;

export const SUPPLIER_ACTIONS = [
  { id: "original", label: "Upload original supporting evidence", recommended: true },
  { id: "alternative", label: "I can't provide the requested document, but I can provide alternative evidence." },
  { id: "attest", label: "Make an authorised declaration" },
  { id: "cannot", label: "I cannot provide or disclose this" },
  { id: "upstream", label: "Ask my supplier" },
  { id: "colleague", label: "Assign colleague" },
  { id: "unknown", label: "I don't know" },
  { id: "wrong", label: "I'm not the right person" },
] as const;

export const SUPPLIER_DISCLOSURE_MODES = [
  {
    id: "SHARE_SOURCE",
    label: "Share the original with this organisation",
    help: "SOURCE may process the file and the requesting organisation may access the original.",
  },
  {
    id: "PROTECTED_SOURCE",
    label: "Keep the original confidential",
    help: "SOURCE may process the file. The organisation receives relevant extracted facts and a provenance summary, not the original file.",
  },
  {
    id: "VERIFICATION_ONLY",
    label: "Verification only",
    help: "SOURCE may check whether the requirement is supported. The organisation does not receive the original or unnecessary extracted facts.",
  },
] as const;
