import { IDENTITY_ENGINE_VERSION } from "./types";
import type {
  CanonicalSubject,
  IdentityEngineVersion,
  SubjectIdentifier,
  SubjectKind,
  SubjectMatchDecision,
  TenantSubjectMapping,
} from "./types";
import { normalizePersonOrOrgName, normalizeToken } from "./normalize";

export interface SubjectIdentityQuery {
  name?: string;
  kind?: SubjectKind;
  gtin?: string;
  mpn?: string;
  manufacturer?: string;
  sku?: string;
  supplierProductCode?: string;
  sourceSystem?: string;
  sourceRecordId?: string;
}

export interface SubjectIdentityCandidate {
  subject: CanonicalSubject;
  decision: SubjectMatchDecision;
  method: "deterministic" | "normalized" | "probabilistic";
  reason: string;
  qualitative: "High confidence" | "Review suggested" | "Unknown";
}

export interface SubjectIdentityResolution {
  decision: SubjectMatchDecision;
  selected?: CanonicalSubject;
  candidates: SubjectIdentityCandidate[];
  autoLinkAllowed: boolean;
  modelVersion: IdentityEngineVersion;
}

function digits(value?: string) {
  return (value ?? "").replace(/\D/g, "");
}

function gtinValid(value: string) {
  const d = digits(value);
  return d.length === 8 || d.length === 12 || d.length === 13 || d.length === 14;
}

function manufacturerOf(subjectId: string, identifiers: SubjectIdentifier[]): string | undefined {
  return identifiers.find((row) => row.canonicalSubjectId === subjectId && row.scheme === "MANUFACTURER")?.value;
}

function sameManufacturer(a?: string, b?: string) {
  if (!a || !b) return false;
  return normalizePersonOrOrgName(a) === normalizePersonOrOrgName(b);
}

export function resolveSubjectIdentity(args: {
  query: SubjectIdentityQuery;
  subjects: CanonicalSubject[];
  identifiers: SubjectIdentifier[];
  mappings: TenantSubjectMapping[];
  tenantId: string;
}): SubjectIdentityResolution {
  const { query, subjects, identifiers, mappings } = args;
  const candidates: SubjectIdentityCandidate[] = [];
  const byId = new Map(subjects.map((s) => [s.id, s]));

  const mapping = query.sourceRecordId
    ? mappings.find(
        (m) =>
          m.sourceRecordId === query.sourceRecordId &&
          (!query.sourceSystem || m.sourceSystem === query.sourceSystem) &&
          m.decision !== "rejected"
      )
    : undefined;
  if (mapping) {
    const subject = byId.get(mapping.canonicalSubjectId);
    if (subject) {
      return {
        decision: "MATCHED",
        selected: subject,
        autoLinkAllowed: true,
        modelVersion: IDENTITY_ENGINE_VERSION,
        candidates: [
          {
            subject,
            decision: "MATCHED",
            method: "deterministic",
            reason: "Known tenant mapping",
            qualitative: "High confidence",
          },
        ],
      };
    }
  }

  const push = (subjectId: string, method: SubjectIdentityCandidate["method"], reason: string) => {
    const subject = byId.get(subjectId);
    if (!subject) return;
    if (query.kind && subject.kind !== query.kind) return;
    if (candidates.some((c) => c.subject.id === subject.id)) return;
    const decision: SubjectMatchDecision = method === "deterministic" ? "MATCHED" : "PROBABLE_MATCH";
    candidates.push({
      subject,
      decision,
      method,
      reason,
      qualitative: method === "deterministic" ? "High confidence" : "Review suggested",
    });
  };

  if (query.gtin && gtinValid(query.gtin)) {
    const g = digits(query.gtin);
    for (const ident of identifiers) {
      if (ident.scheme === "GTIN" && digits(ident.value) === g) push(ident.canonicalSubjectId, "deterministic", "Exact GTIN");
    }
  }

  if (query.mpn) {
    const mpn = normalizeToken(query.mpn);
    const matches = identifiers.filter((i) => i.scheme === "MPN" && normalizeToken(i.value) === mpn);
    for (const match of matches) {
      const existingMfr = manufacturerOf(match.canonicalSubjectId, identifiers);
      if (query.manufacturer && sameManufacturer(query.manufacturer, existingMfr)) {
        push(match.canonicalSubjectId, "deterministic", "Exact MPN + manufacturer");
      } else if (query.manufacturer && existingMfr && !sameManufacturer(query.manufacturer, existingMfr)) {
        push(match.canonicalSubjectId, "probabilistic", "Same MPN, different manufacturer");
      } else {
        push(match.canonicalSubjectId, "normalized", "MPN without complete manufacturer");
      }
    }
  }

  if (query.sku) {
    const sku = normalizeToken(query.sku);
    for (const ident of identifiers) {
      if (ident.scheme === "SKU" && normalizeToken(ident.value) === sku) push(ident.canonicalSubjectId, "normalized", "Normalized SKU");
    }
  }

  if (query.supplierProductCode) {
    const code = normalizeToken(query.supplierProductCode);
    for (const ident of identifiers) {
      if (ident.scheme === "SUPPLIER_PID" && normalizeToken(ident.value) === code) {
        push(ident.canonicalSubjectId, "deterministic", "Supplier product identifier");
      }
    }
  }

  if (query.name) {
    const qName = normalizePersonOrOrgName(query.name);
    for (const subject of subjects) {
      if (query.kind && subject.kind !== query.kind) continue;
      const n = normalizePersonOrOrgName(subject.name);
      if (n === qName) push(subject.id, "normalized", "Normalized name");
      else if (n && qName && (n.includes(qName) || qName.includes(n)) && Math.abs(n.length - qName.length) <= 6) {
        push(subject.id, "probabilistic", "Similar name");
      }
    }
  }

  const matched = candidates.filter((c) => c.decision === "MATCHED" && c.method === "deterministic");
  const differentManufacturer = candidates.filter((c) => c.reason === "Same MPN, different manufacturer");
  const probable = candidates.filter((c) => c.decision === "PROBABLE_MATCH");

  if (matched.length === 1) {
    return {
      decision: "MATCHED",
      selected: matched[0].subject,
      candidates,
      autoLinkAllowed: true,
      modelVersion: IDENTITY_ENGINE_VERSION,
    };
  }
  if (matched.length > 1) {
    return {
      decision: "AMBIGUOUS",
      candidates: matched,
      autoLinkAllowed: false,
      modelVersion: IDENTITY_ENGINE_VERSION,
    };
  }
  if (differentManufacturer.length > 0) {
    return {
      decision: "AMBIGUOUS",
      candidates: differentManufacturer,
      autoLinkAllowed: false,
      modelVersion: IDENTITY_ENGINE_VERSION,
    };
  }
  if (probable.length > 1) {
    return {
      decision: "AMBIGUOUS",
      candidates: probable,
      autoLinkAllowed: false,
      modelVersion: IDENTITY_ENGINE_VERSION,
    };
  }
  if (probable.length === 1) {
    return {
      decision: "PROBABLE_MATCH",
      selected: probable[0].subject,
      candidates,
      autoLinkAllowed: false,
      modelVersion: IDENTITY_ENGINE_VERSION,
    };
  }
  return { decision: "NO_MATCH", candidates, autoLinkAllowed: false, modelVersion: IDENTITY_ENGINE_VERSION };
}

export function isGtinValid(value?: string) {
  if (!value) return false;
  return gtinValid(value);
}
