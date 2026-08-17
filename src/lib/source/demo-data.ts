/** Clickable-discovery demo data from the SOURCE product blueprint. */

export type IdentityStatus = "matched" | "review" | "unresolved";
export type EvidenceStatus = "ready" | "review" | "missing" | "authorization";
export type RequestStatus =
  | "draft"
  | "sent"
  | "opened"
  | "in_progress"
  | "submitted"
  | "review_required"
  | "complete"
  | "overdue";

export interface DemoProduct {
  id: string;
  name: string;
  sku: string;
  supplier: string;
  identity: IdentityStatus;
  evidence: number;
  status: EvidenceStatus;
  gtin?: string;
  category: string;
}

export interface DemoComponent {
  id: string;
  name: string;
  status: EvidenceStatus;
  label: string;
}

export interface DemoClaim {
  id: string;
  property: string;
  value: string;
  unit?: string;
  subject: string;
  productId: string;
  declaredBy: string;
  evidenceId?: string;
  validUntil: string;
  identityConfidence: number;
  evidenceStatus: "verified" | "evidenced" | "declared" | "missing";
  permission: "verified_customers" | "request" | "private" | "allowed";
  purpose: string;
  ready: boolean;
}

export interface DemoSupplier {
  id: string;
  name: string;
  legalName: string;
  products: number;
  missing: number;
  evidence: number;
  requests: number;
  status: "active" | "attention";
  identityConfidence: number;
  vat?: string;
  country: string;
}

export interface DemoEvidence {
  id: string;
  filename: string;
  sha256: string;
  issuer: string;
  supplierId: string;
  validUntil: string;
  verification: "verified" | "pending" | "expired";
  linkedClaims: string[];
}

export interface DemoRequest {
  id: string;
  supplierId: string;
  supplierName: string;
  claimsRequested: number;
  complete: number;
  sent: string;
  lastActivity: string;
  due: string;
  status: RequestStatus;
  timeline: { date: string; event: string }[];
}

export const DEMO_ORG = {
  name: "Acme Manufacturing B.V.",
  legalName: "Acme Manufacturing B.V.",
  kvk: "34123456",
  vat: "NL822012345B01",
  country: "Netherlands",
  website: "https://acme.example",
};

export const DEMO_COVERAGE = {
  productsImported: 8421,
  supplierRelationships: 684,
  identityResolved: 82,
  autoResolved: 72,
  evidenceCovered: 61,
  immediatelyReusable: 38,
  authorizationRequired: 23,
  identityReview: 117,
  missingClaims: 8614,
  expiringSoon: 317,
  overdueRequests: 14,
};

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: "urban-chair-04",
    name: "Urban Chair 04",
    sku: "CH-104",
    supplier: "Acme",
    identity: "matched",
    evidence: 81,
    status: "review",
    gtin: "08712345678901",
    category: "Seating",
  },
  {
    id: "desk-02",
    name: "Desk 02",
    sku: "DK-281",
    supplier: "FurnCo",
    identity: "matched",
    evidence: 100,
    status: "ready",
    gtin: "08712345678918",
    category: "Desks",
  },
  {
    id: "lounge-11",
    name: "Lounge 11",
    sku: "LG-011",
    supplier: "Supplier A",
    identity: "review",
    evidence: 44,
    status: "missing",
    category: "Seating",
  },
  {
    id: "shelf-07",
    name: "Shelf 07",
    sku: "SH-007",
    supplier: "Supplier B",
    identity: "matched",
    evidence: 29,
    status: "authorization",
    category: "Storage",
  },
];

export const URBAN_CHAIR_COMPONENTS: DemoComponent[] = [
  { id: "al-frame-881", name: "Aluminium Frame", status: "ready", label: "READY" },
  { id: "textile", name: "Textile", status: "missing", label: "MISSING DATA" },
  { id: "fasteners", name: "Fasteners", status: "ready", label: "VERIFIED" },
  { id: "packaging", name: "Packaging", status: "authorization", label: "AUTHORIZATION REQUIRED" },
];

export const DEMO_CLAIMS: DemoClaim[] = [
  {
    id: "claim-recycled-al",
    property: "recycled_content",
    value: "67",
    unit: "%",
    subject: "AL-FRAME-881",
    productId: "urban-chair-04",
    declaredBy: "Supplier A",
    evidenceId: "ev-92831",
    validUntil: "2028-12-31",
    identityConfidence: 99.7,
    evidenceStatus: "verified",
    permission: "verified_customers",
    purpose: "DPP compliance",
    ready: true,
  },
  {
    id: "claim-origin-textile",
    property: "origin_country",
    value: "",
    subject: "TEXTILE-04",
    productId: "urban-chair-04",
    declaredBy: "Supplier B",
    validUntil: "",
    identityConfidence: 81.2,
    evidenceStatus: "missing",
    permission: "private",
    purpose: "DPP compliance",
    ready: false,
  },
  {
    id: "claim-packaging-recycled",
    property: "recycled_content",
    value: "42",
    unit: "%",
    subject: "PACK-04",
    productId: "urban-chair-04",
    declaredBy: "Supplier A",
    evidenceId: "ev-44102",
    validUntil: "2027-03-01",
    identityConfidence: 99.1,
    evidenceStatus: "evidenced",
    permission: "request",
    purpose: "DPP compliance",
    ready: false,
  },
];

export const DEMO_SUPPLIERS: DemoSupplier[] = [
  {
    id: "supplier-a",
    name: "Supplier A",
    legalName: "Supplier A GmbH",
    products: 318,
    missing: 42,
    evidence: 86,
    requests: 1,
    status: "active",
    identityConfidence: 99.8,
    vat: "DE813334455",
    country: "Germany",
  },
  {
    id: "supplier-b",
    name: "Supplier B",
    legalName: "Supplier B S.r.l.",
    products: 114,
    missing: 91,
    evidence: 41,
    requests: 2,
    status: "attention",
    identityConfidence: 88.4,
    vat: "IT01234567890",
    country: "Italy",
  },
  {
    id: "furnco",
    name: "FurnCo",
    legalName: "FurnCo BV",
    products: 86,
    missing: 4,
    evidence: 97,
    requests: 0,
    status: "active",
    identityConfidence: 99.2,
    vat: "NL001234567B01",
    country: "Netherlands",
  },
];

export const DEMO_EVIDENCE: DemoEvidence[] = [
  {
    id: "ev-92831",
    filename: "cert-92831.pdf",
    sha256: "a9f3c1e8b2d74f01c6e5a0b8d3f27c91e4b6a1d0c8f5e2b7a3d9c4e1f6b8a2d5",
    issuer: "Accredited certifier",
    supplierId: "supplier-a",
    validUntil: "2028-12-31",
    verification: "verified",
    linkedClaims: ["claim-recycled-al"],
  },
  {
    id: "ev-44102",
    filename: "packaging-lca-2026.pdf",
    sha256: "c1b8e4a0d7f32e19a6c5b8d1f4e7a0c3b6d9e2f5a8c1d4e7b0a3c6f9d2e5a8b1",
    issuer: "Supplier A",
    supplierId: "supplier-a",
    validUntil: "2027-03-01",
    verification: "pending",
    linkedClaims: ["claim-packaging-recycled"],
  },
  {
    id: "ev-expiring",
    filename: "iso14021-fasteners.pdf",
    sha256: "d4e7a1c8f0b3e6a9d2c5f8b1e4a7c0d3f6a9b2e5c8d1f4a7b0e3c6d9f2a5b8c1",
    issuer: "TÜV",
    supplierId: "supplier-b",
    validUntil: "2026-09-12",
    verification: "expired",
    linkedClaims: [],
  },
];

export const DEMO_REQUESTS: DemoRequest[] = [
  {
    id: "req-supplier-a",
    supplierId: "supplier-a",
    supplierName: "Supplier A",
    claimsRequested: 24,
    complete: 18,
    sent: "2026-08-12",
    lastActivity: "2026-08-15",
    due: "2026-08-26",
    status: "review_required",
    timeline: [
      { date: "12 Aug", event: "Request sent" },
      { date: "13 Aug", event: "Supplier opened" },
      { date: "14 Aug", event: "Evidence uploaded" },
      { date: "14 Aug", event: "14 claims extracted" },
      { date: "15 Aug", event: "3 claims need review" },
    ],
  },
  {
    id: "req-supplier-b",
    supplierId: "supplier-b",
    supplierName: "Supplier B",
    claimsRequested: 31,
    complete: 6,
    sent: "2026-07-30",
    lastActivity: "2026-08-02",
    due: "2026-08-13",
    status: "overdue",
    timeline: [
      { date: "30 Jul", event: "Request sent" },
      { date: "02 Aug", event: "Supplier opened" },
    ],
  },
];

export const DEMO_IDENTITY_REVIEWS = [
  {
    id: "id-4471",
    source: "SUP-4471 · Acme Aluminium",
    candidate: "Acme Aluminium GmbH",
    meta: "Germany · VAT DE811128135",
    confidence: 91,
  },
  {
    id: "id-bosch",
    source: "Bosch GmbH",
    candidate: "Robert Bosch GmbH",
    meta: "Germany · VAT DE811128135",
    confidence: 99.7,
  },
];

export const DEMO_EVIDENCE_REVIEWS = [
  {
    id: "ex-1",
    document: "cert-92831.pdf",
    finding: "Recycled content 67%",
    page: 4,
    confidence: 96,
  },
];

export const COLLECTION_ANALYSIS = {
  supplier: "Supplier A",
  scope: "18 product families · 318 SKUs",
  dataset: "ESPR - Aluminium v2027",
  required: 143,
  alreadyAvailable: 101,
  reusable: 18,
  requireAuthorization: 7,
  missing: 17,
  actions: 24,
};

export function productById(id: string) {
  return DEMO_PRODUCTS.find((p) => p.id === id);
}

export function supplierById(id: string) {
  return DEMO_SUPPLIERS.find((s) => s.id === id);
}

export function requestById(id: string) {
  return DEMO_REQUESTS.find((r) => r.id === id);
}

export function evidenceById(id: string) {
  return DEMO_EVIDENCE.find((e) => e.id === id);
}

export function claimsForProduct(productId: string) {
  return DEMO_CLAIMS.filter((c) => c.productId === productId);
}
