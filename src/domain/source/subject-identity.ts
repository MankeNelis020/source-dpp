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
    const decision: SubjectMatchDecision = method === "probabilistic" ? "PROBABLE_MATCH" : "MATCHED";
    candidates.push({
      subject,
      decision,
      method,
      reason,
      qualitative: method === "deterministic" ? "High confidence" : method === "normalized" ? "High confidence" : "Review suggested",
    });
  };

  if (query.gtin && gtinValid(query.gtin)) {
    const g = digits(query.gtin);
    for (const ident of identifiers) {
      if (ident.scheme === "GTIN" && digits(ident.value) === g) push(ident.canonicalSubjectId, "deterministic", "Exact GTIN");
    }
  }

  if (query.mpn && query.manufacturer) {
    const mpn = normalizeToken(query.mpn);
    const mfr = normalizePersonOrOrgName(query.manufacturer);
    for (const ident of identifiers) {
      if (ident.scheme !== "MPN" || normalizeToken(ident.value) !== mpn) continue;
      const subject = byId.get(ident.canonicalSubjectId);
      if (!subject) continue;
      const manufacturerIdent = identifiers.find(
        (row) => row.canonicalSubjectId === subject.id && row.scheme === "INTERNAL" && normalizePersonOrOrgName(row.value) === mfr
      );
      const nameHit = normalizePersonOrOrgName(subject.name).includes(mfr) || mfr.includes(normalizePersonOrOrgName(subject.name));
      if (manufacturerIdent || nameHit || query.manufacturer === subject.name) {
        push(subject.id, "deterministic", "Exact MPN + manufacturer");
      }
    }
  } else if (query.mpn) {
    const mpn = normalizeToken(query.mpn);
    const matches = identifiers.filter((i) => i.scheme === "MPN" && normalizeToken(i.value) === mpn);
    if (matches.length === 1) push(matches[0].canonicalSubjectId, "normalized", "Exact MPN");
    if (matches.length > 1) {
      for (const match of matches) push(match.canonicalSubjectId, "probabilistic", "Same MPN, manufacturer missing");
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

  const matched = candidates.filter((c) => c.decision === "MATCHED");
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
  if (matched.length > 1 || (probable.length > 1 && matched.length === 0)) {
    return {
      decision: "AMBIGUOUS",
      candidates: matched.length ? matched : probable,
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
