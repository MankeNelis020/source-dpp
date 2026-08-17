import type { Actor, ActorRelationship, ClaimRecord, EvidenceRecord, InformationRequirement } from "./types";

export interface RoutingSuggestion {
  actor?: Actor;
  reason: string;
  confidence: number;
  needsReview: boolean;
}

export function suggestActor(args: {
  requirement: InformationRequirement;
  actors: Actor[];
  relationships: ActorRelationship[];
  claims: ClaimRecord[];
  evidence: EvidenceRecord[];
  declaredSupplierId?: string;
  contractualSupplierId?: string;
  manufacturerId?: string;
  internalOwnerId?: string;
  reviewBelow?: number;
}): RoutingSuggestion {
  const reviewBelow = args.reviewBelow ?? 85;

  const evidenceOwnerId = args.evidence.find((e) =>
    args.claims.some((c) => c.subjectId === args.requirement.subjectId && c.evidenceId === e.id)
  )?.ownerActorId;
  if (evidenceOwnerId) {
    const actor = args.actors.find((a) => a.id === evidenceOwnerId);
    if (actor) {
      return { actor, reason: "Evidence owner in SOURCE", confidence: 99.4, needsReview: false };
    }
  }

  const declared = args.declaredSupplierId
    ? args.actors.find((a) => a.id === args.declaredSupplierId)
    : undefined;
  if (declared) {
    return {
      actor: declared,
      reason: `Supplier relationship for ${args.requirement.subjectId}`,
      confidence: 99.2,
      needsReview: false,
    };
  }

  const contractual = args.contractualSupplierId
    ? args.actors.find((a) => a.id === args.contractualSupplierId)
    : undefined;
  if (contractual) {
    return { actor: contractual, reason: "Contractual supplier from ERP", confidence: 94, needsReview: false };
  }

  const upstreamRel = args.relationships.find((r) => r.subjectId === args.requirement.subjectId);
  if (upstreamRel) {
    const actor = args.actors.find((a) => a.id === upstreamRel.toActorId);
    if (actor) {
      return { actor, reason: "Known upstream supplier", confidence: 91, needsReview: 91 < reviewBelow };
    }
  }

  const manufacturer = args.manufacturerId
    ? args.actors.find((a) => a.id === args.manufacturerId)
    : undefined;
  if (manufacturer) {
    return { actor: manufacturer, reason: "Manufacturer / brand owner", confidence: 70, needsReview: true };
  }

  const internal = args.internalOwnerId
    ? args.actors.find((a) => a.id === args.internalOwnerId)
    : undefined;
  if (internal) {
    return { actor: internal, reason: "Assigned internal data owner", confidence: 68, needsReview: true };
  }

  return {
    reason: "Manual procurement escalation",
    confidence: 40,
    needsReview: true,
  };
}

export const CONTACT_PRIORITY: ContactPointRole[] = [
  "product_data",
  "compliance",
  "account",
  "sustainability",
  "quality",
  "sales",
  "general",
];

type ContactPointRole =
  | "compliance"
  | "quality"
  | "product_data"
  | "sales"
  | "account"
  | "sustainability"
  | "general";

export function pickContact<T extends { role: ContactPointRole; valid: boolean; lastSuccessAt?: string }>(
  contacts: T[]
): T | undefined {
  const valid = contacts.filter((c) => c.valid);
  const successful = valid.filter((c) => c.lastSuccessAt);
  if (successful.length) {
    return successful.sort((a, b) => (b.lastSuccessAt ?? "").localeCompare(a.lastSuccessAt ?? ""))[0];
  }
  return CONTACT_PRIORITY.map((role) => valid.find((c) => c.role === role)).find(Boolean);
}
