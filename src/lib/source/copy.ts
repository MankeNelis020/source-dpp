/** Public-site copy for the product-evidence resolution layer. */

export const HERO_LINE_1 = "Lightweight in your stack.";
export const HERO_LINE_2 = "Heavyweight on evidence.";

export const PRIMARY_CTA = {
  href: "/signup",
  label: "Request an evidence assessment",
} as const;

export const SUPPLIER_CTA = {
  href: "/s/demo",
  label: "See a supplier request",
} as const;

export const EVIDENCE_STAGES = [
  {
    n: "01",
    title: "Find gaps",
    body: "SOURCE compares what a product record already holds with the evidence still required. Missing, expired, unscoped or unpermissioned items stay visible.",
  },
  {
    n: "02",
    title: "Retrieve what exists",
    body: "Existing files, certificates and prior disclosures are attached to the record when identity, scope and permission allow. SOURCE does not invent values.",
  },
  {
    n: "03",
    title: "Prepare targeted requests",
    body: "Where evidence is still missing, SOURCE prepares a scoped request for the responsible supplier or internal owner. Uncertain identities remain visible instead of being guessed.",
  },
  {
    n: "04",
    title: "Resolve with evidence",
    body: "Returned evidence is recorded with provenance. Decline, silence, delegation, permission denial and unresolved outcomes are first-class results — not hidden failures.",
  },
] as const;

export const EVIDENCE_PRINCIPLES = [
  {
    title: "Traceability",
    body: "A value is only useful if it can be followed to a record, a document, and an actor. SOURCE stores that path.",
  },
  {
    title: "Scope",
    body: "Evidence applies to a stated product, period, market or purpose. Out-of-scope documents do not close a gap.",
  },
  {
    title: "Permission",
    body: "Reuse is never implicit. A supplier or owner decides who may use the evidence, for what, and whether that grant still holds.",
  },
  {
    title: "Validity",
    body: "Certificates expire. SOURCE keeps validity dates visible. Expired evidence does not pass the validity gate.",
  },
  {
    title: "Conflicts",
    body: "Two documents can disagree. Conflicting values stay open until a human reviews them. SOURCE does not pick a winner in silence.",
  },
  {
    title: "Unresolved outcomes",
    body: "No response, a decline, or an uncertain owner is a recorded outcome. The record stays UNRESOLVED until the applicable gates pass.",
  },
] as const;

export const READINESS_GATES = [
  {
    title: "Identity",
    body: "The product, component or supplier the value is about must be reconciled. Ambiguous matches stay in review.",
  },
  {
    title: "Value",
    body: "A stated property exists on the record. SOURCE does not fill empty fields with inference presented as fact.",
  },
  {
    title: "Evidence",
    body: "A document or source record is attached. A declaration without evidence does not pass this gate.",
  },
  {
    title: "Scope",
    body: "The evidence covers the product, period and purpose being asked. Adjacent but non-matching documents remain unused.",
  },
  {
    title: "Validity",
    body: "The evidence is still inside its stated validity window, or the gap remains open.",
  },
  {
    title: "Permission",
    body: "Recorded consent allows the intended reuse. Denied or missing permission keeps the record unresolved for that use.",
  },
  {
    title: "Conflict",
    body: "Outstanding conflicts have been reviewed. Unreviewed disagreement blocks READY.",
  },
] as const;

export const LIFECYCLE = [
  {
    n: "01",
    title: "Import what you already have",
    body: "Connect files from ERP, PIM, PLM or spreadsheets. SOURCE does not replace those systems. Native connectors and APIs are assessment-dependent, not assumed generally available.",
  },
  {
    n: "02",
    title: "Reconcile identity",
    body: "Names, identifiers and aliases are scored. High-confidence matches can proceed. Uncertain contacts and duplicate suppliers stay visible for review.",
  },
  {
    n: "03",
    title: "Identify evidence gaps",
    body: "Required properties are compared with attached evidence. Missing, expired, unscoped or unpermissioned items become the work list.",
  },
  {
    n: "04",
    title: "Prepare focused requests",
    body: "Gaps are grouped for the likely owner — a supplier or an internal role — not one mail per SKU. Wrong or uncertain owners are not auto-resolved.",
  },
  {
    n: "05",
    title: "Record supplier outcomes, including unsuccessful ones",
    body: "A supplier may answer, decline, delegate, express uncertainty, deny reuse permission, or not respond. Each outcome is stored. Silence is not success.",
  },
  {
    n: "06",
    title: "Apply readiness gates",
    body: "Identity, value, evidence, scope, validity, permission and conflict must all pass where they apply. READY is not a marketing label; it is the conjunction of those gates.",
  },
  {
    n: "07",
    title: "Make the record available downstream",
    body: "Exports and, where in scope, APIs can feed DPP, compliance or procurement tools. SOURCE prepares evidence before publication. It does not publish passports or create data carriers.",
  },
] as const;

export const PUBLIC_FAQS = [
  {
    q: "Does SOURCE replace ERP, PIM, PLM or a DPP platform?",
    a: "No. SOURCE is a product-evidence resolution layer beside those systems. Product identity and master data stay where they already live. SOURCE does not become another catalogue.",
  },
  {
    q: "Does SOURCE publish Digital Product Passports?",
    a: "No. SOURCE prepares evidence before publication. It does not publish passports, create QR codes, or issue data carriers.",
  },
  {
    q: "When is a record READY?",
    a: "A record is READY only when every applicable gate passes: identity, value, evidence, scope, validity, permission, and conflict. SOURCE records the outcome. It does not independently certify evidence.",
  },
  {
    q: "What happens if a supplier does not answer?",
    a: "Decline, uncertainty, delegation, permission denial, and no response are recorded outcomes. Silence is not treated as coverage. The claim stays UNRESOLVED until the applicable gates pass.",
  },
  {
    q: "Does SOURCE guarantee compliance or legal sufficiency?",
    a: "No. SOURCE does not determine definitive legal scope for every SKU and does not guarantee that a record is legally sufficient under a delegated act. Product-group legal review remains required.",
  },
  {
    q: "What does an evidence assessment cost?",
    a: "Public pages do not list fixed prices or go-live timelines. Scope, connectors, and commercial terms are confirmed in a controlled assessment. Request that assessment through the existing discovery flow.",
  },
] as const;

export const RESOURCE_DIRECTIONS = [
  {
    title: "Evidence-gap patterns",
    body: "Forthcoming notes on recurring gaps — expired certificates, unscoped mill declarations, missing reuse permission — once pilot material exists. Nothing on this list is published yet.",
  },
  {
    title: "Supplier-request design",
    body: "Forthcoming guidance on scoped disclosure, delegation, and recording unsuccessful outcomes. Placeholder only until a substantive brief is written.",
  },
  {
    title: "DPP pre-publication checklists",
    body: "Forthcoming operational checklists for preparing evidence before a passport is published. They will not claim legal completeness for every product group.",
  },
] as const;
