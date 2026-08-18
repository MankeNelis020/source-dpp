import type { CanonicalSubject, SubjectKind, SubjectRelationship } from "./types";

export const SUBJECT_KINDS: SubjectKind[] = [
  "PRODUCT",
  "PRODUCT_FAMILY",
  "VARIANT",
  "BATCH",
  "ITEM",
  "COMPONENT",
  "MATERIAL",
  "RAW_MATERIAL",
  "PACKAGING",
  "FACILITY",
];

export function defaultPropertiesForKind(kind: SubjectKind): { propertyId: string; propertyLabel: string }[] {
  if (kind === "PRODUCT" || kind === "PRODUCT_FAMILY" || kind === "VARIANT") {
    return [{ propertyId: "country_of_manufacture", propertyLabel: "Country of manufacture" }];
  }
  if (kind === "PACKAGING") {
    return [{ propertyId: "recycled_content", propertyLabel: "Packaging recycled content" }];
  }
  if (kind === "BATCH" || kind === "ITEM") {
    return [{ propertyId: "recycled_content_percentage", propertyLabel: "Recycled content percentage" }];
  }
  if (kind === "MATERIAL" || kind === "RAW_MATERIAL" || kind === "COMPONENT") {
    return [
      { propertyId: "recycled_content", propertyLabel: "Recycled content" },
      { propertyId: "material_origin", propertyLabel: "Material origin" },
    ];
  }
  return [{ propertyId: "origin_country", propertyLabel: "Origin" }];
}

export function productIdsForSubject(
  subjectId: string,
  subjects: CanonicalSubject[],
  relationships: SubjectRelationship[]
): string[] {
  const subject = subjects.find((s) => s.id === subjectId);
  if (subject?.kind === "PRODUCT" || subject?.kind === "VARIANT") return [subjectId];

  const products: string[] = [];
  const walk = (childId: string, seen: Set<string>) => {
    if (seen.has(childId)) return;
    seen.add(childId);
    const parentRels = relationships.filter((r) => r.childSubjectId === childId);
    if (!parentRels.length) {
      const node = subjects.find((s) => s.id === childId);
      if (node && (node.kind === "PRODUCT" || node.kind === "VARIANT")) products.push(node.id);
      return;
    }
    for (const rel of parentRels) {
      const parent = subjects.find((s) => s.id === rel.parentSubjectId);
      if (parent && (parent.kind === "PRODUCT" || parent.kind === "VARIANT")) {
        products.push(parent.id);
      } else {
        walk(rel.parentSubjectId, seen);
      }
    }
  };
  walk(subjectId, new Set());
  return [...new Set(products)];
}

export function childrenOf(parentSubjectId: string, relationships: SubjectRelationship[]): string[] {
  return relationships.filter((r) => r.parentSubjectId === parentSubjectId).map((r) => r.childSubjectId);
}
