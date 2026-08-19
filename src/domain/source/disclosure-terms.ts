import { createHash } from "node:crypto";

/**
 * Canonical, versioned Data Disclosure Terms.
 *
 * LEGAL REVIEW REQUIRED before any public production launch.
 * This copy establishes the product mechanism and auditability. It is not
 * final legal advice and must not be treated as a signed-off contract.
 */

export type LegalReviewStatus = "REQUIRES_LEGAL_REVIEW";

export interface DataDisclosureTerms {
  agreementId: string;
  version: string;
  effectiveDate: string;
  legalReviewStatus: LegalReviewStatus;
  hash: string;
  title: string;
  purpose: string;
  retentionSummary: string;
  reuseSummary: string;
  sections: { heading: string; body: string }[];
  fullText: string;
}

export const DATA_DISCLOSURE_AGREEMENT_ID = "source-data-disclosure-terms";

export const DATA_DISCLOSURE_TERMS_V1_DRAFT: DataDisclosureTerms = buildTerms({
  version: "v1-draft-legal-review",
  effectiveDate: "2026-08-19",
  title: "SOURCE Data Disclosure Terms (draft — legal review required)",
  purpose: "Process supplier evidence for a defined information request so SOURCE can assess whether a requirement is supported, retain provenance, and share only what the chosen disclosure mode allows.",
  retentionSummary:
    "SOURCE keeps the original evidence, extracted claims, disclosure acceptances and audit records for this request and for the organisation’s applicable retention period. V1 does not auto-delete evidence when a request closes.",
  reuseSummary:
    "SOURCE does not silently reuse your evidence for other customers. Reuse is limited to the policy you accept: no reuse, reuse within this requesting organisation, or broader reuse only when you explicitly permit it. Broader reuse is recorded in V1; SOURCE still does not share evidence across organisations automatically.",
  sections: [
    {
      heading: "Why this is requested",
      body: "The requesting organisation needs specific product information to complete a Digital Product Passport or related compliance dataset. SOURCE asks only for evidence that can support the listed requirements.",
    },
    {
      heading: "Who is requesting it",
      body: "The requesting organisation named on this request, for the products and requirements listed in the request scope. SOURCE is the processor of this request, not a public register.",
    },
    {
      heading: "What is the scope",
      body: "Only the products, requirements and evidence request shown before you accept. Accepting these terms does not authorise SOURCE to collect unrelated information.",
    },
    {
      heading: "How SOURCE will use what you provide",
      body: "SOURCE may process the evidence for this request, extract relevant facts or claims, assess whether the evidence supports each listed requirement, and retain provenance and audit information. A supplier statement is not automatically treated as proof.",
    },
    {
      heading: "Who can see the original",
      body: "Access to the original file is controlled by the disclosure mode you choose. The original document does not become public because it was uploaded to SOURCE. Digital Product Passport values and original-file visibility are separate.",
    },
    {
      heading: "What may be shared as derived data",
      body: "Depending on the disclosure mode, the requesting organisation may receive extracted relevant claims, a provenance summary, an evidence-strength assessment, and/or a verification result. SOURCE will not imply that the original document is published.",
    },
    {
      heading: "Can SOURCE reuse it",
      body: "Reuse follows the policy shown on this request. There is no silent cross-customer reuse. Evidence remains associated with the terms version accepted when it was supplied.",
    },
    {
      heading: "Retention",
      body: "SOURCE retains originals, assessments and audit events according to the retention summary above. Historical acceptance records are not altered when these terms are updated; a new version is created instead.",
    },
    {
      heading: "Legal status of this draft",
      body: "This text is a product draft. It requires legal review before public production launch. Submitting evidence under this draft records your operational acceptance of the disclosed processing rules for this request.",
    },
  ],
});

export const DATA_DISCLOSURE_TERMS_V1_1_DRAFT: DataDisclosureTerms = buildTerms({
  version: "v1.1-draft-legal-review",
  effectiveDate: "2026-08-19",
  title: "SOURCE Data Disclosure Terms (draft — legal review required)",
  purpose: "Process supplier evidence for a defined information request so SOURCE can assess whether a requirement is supported, retain provenance, and share only what the chosen disclosure mode allows.",
  retentionSummary:
    "SOURCE keeps the original evidence, extracted claims, disclosure acceptances and audit records for this request and for the organisation’s applicable retention period. V1 does not auto-delete evidence when a request closes.",
  reuseSummary:
    "SOURCE may identify when evidence you previously provided appears relevant to another product or information request. Identifying evidence as potentially relevant does not automatically authorise SOURCE to reuse it. Unless you have explicitly allowed reuse within the same requesting organisation and the new use falls within that permission, SOURCE will ask for your approval before applying the evidence to another request. SOURCE will not silently share your evidence with another customer.",
  sections: [
    {
      heading: "Why this is requested",
      body: "The requesting organisation needs specific product information to complete a Digital Product Passport or related compliance dataset. SOURCE asks only for evidence that can support the listed requirements.",
    },
    {
      heading: "Who is requesting it",
      body: "The requesting organisation named on this request, for the products and requirements listed in the request scope. SOURCE is the processor of this request, not a public register.",
    },
    {
      heading: "What is the scope",
      body: "Only the products, requirements and evidence request shown before you accept. Accepting these terms does not authorise SOURCE to collect unrelated information.",
    },
    {
      heading: "How SOURCE will use what you provide",
      body: "SOURCE may process the evidence for this request, extract relevant facts or claims, assess whether the evidence supports each listed requirement, and retain provenance and audit information. A supplier statement is not automatically treated as proof.",
    },
    {
      heading: "Who can see the original",
      body: "Access to the original file is controlled by the disclosure mode you choose. The original document does not become public because it was uploaded to SOURCE. Digital Product Passport values and original-file visibility are separate.",
    },
    {
      heading: "What may be shared as derived data",
      body: "Depending on the disclosure mode, the requesting organisation may receive extracted relevant claims, a provenance summary, an evidence-strength assessment, and/or a verification result. SOURCE will not imply that the original document is published.",
    },
    {
      heading: "Evidence reuse",
      body: "SOURCE may identify when evidence you previously provided appears relevant to another product or information request. Identifying evidence as potentially relevant does not automatically authorise SOURCE to reuse it. Unless you have explicitly allowed reuse within the same requesting organisation and the new use falls within that permission, SOURCE will ask for your approval before applying the evidence to another request. SOURCE will not silently share your evidence with another customer. A one-time approval covers only the proposed request, products and requirements. It does not change the reuse policy for unrelated future requests, and it never widens who may see the original file.",
    },
    {
      heading: "Retention",
      body: "SOURCE retains originals, assessments and audit events according to the retention summary above. Historical acceptance records are not altered when these terms are updated; a new version is created instead.",
    },
    {
      heading: "Legal status of this draft",
      body: "This text is a product draft. It requires legal review before public production launch. Submitting evidence under this draft records your operational acceptance of the disclosed processing rules for this request.",
    },
  ],
});

export const DATA_DISCLOSURE_TERMS_CATALOG: DataDisclosureTerms[] = [
  DATA_DISCLOSURE_TERMS_V1_DRAFT,
  DATA_DISCLOSURE_TERMS_V1_1_DRAFT,
];

let currentVersion = DATA_DISCLOSURE_TERMS_V1_1_DRAFT.version;

export function currentDataDisclosureTerms(): DataDisclosureTerms {
  return dataDisclosureTermsByVersion(currentVersion) ?? DATA_DISCLOSURE_TERMS_CATALOG[0];
}

export function dataDisclosureTermsByVersion(version: string): DataDisclosureTerms | undefined {
  return DATA_DISCLOSURE_TERMS_CATALOG.find((item) => item.version === version);
}

export function hashDisclosureTermsText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Test-only: publish a new current version without mutating historical catalog rows. */
export function activateDataDisclosureTermsForTests(terms: DataDisclosureTerms) {
  if (!DATA_DISCLOSURE_TERMS_CATALOG.some((item) => item.version === terms.version)) {
    DATA_DISCLOSURE_TERMS_CATALOG.push(terms);
  }
  currentVersion = terms.version;
}

export function resetDataDisclosureTermsForTests() {
  currentVersion = DATA_DISCLOSURE_TERMS_V1_1_DRAFT.version;
  DATA_DISCLOSURE_TERMS_CATALOG.splice(
    0,
    DATA_DISCLOSURE_TERMS_CATALOG.length,
    DATA_DISCLOSURE_TERMS_V1_DRAFT,
    DATA_DISCLOSURE_TERMS_V1_1_DRAFT
  );
}

function buildTerms(
  input: Omit<DataDisclosureTerms, "agreementId" | "legalReviewStatus" | "hash" | "fullText">
): DataDisclosureTerms {
  const fullText = [
    input.title,
    `Version ${input.version}`,
    `Effective ${input.effectiveDate}`,
    `Purpose: ${input.purpose}`,
    `Retention: ${input.retentionSummary}`,
    `Reuse: ${input.reuseSummary}`,
    ...input.sections.map((section) => `${section.heading}\n${section.body}`),
    "LEGAL REVIEW REQUIRED before public production launch.",
  ].join("\n\n");
  return {
    agreementId: DATA_DISCLOSURE_AGREEMENT_ID,
    legalReviewStatus: "REQUIRES_LEGAL_REVIEW",
    hash: hashDisclosureTermsText(fullText),
    fullText,
    ...input,
  };
}
