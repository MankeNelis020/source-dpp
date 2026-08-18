import type { InformationRequirement, Purpose, SubjectKind, TrustLevel } from "./types";

export const PILOT_DATASET_ID = "pilot-missing-information-v1";
export const PILOT_DATASET_VERSION = "1.0.0";
export const PILOT_DATASET_LABEL = "PILOT DATASET";

export interface PilotProperty {
  propertyId: string;
  propertyLabel: string;
  requiredTrustLevel: TrustLevel;
  requiredPermissionLevel: "granted" | "not_required";
  purpose: Purpose;
}

const SHARED_EVIDENCE: Pick<PilotProperty, "requiredTrustLevel" | "requiredPermissionLevel" | "purpose"> = {
  requiredTrustLevel: "EVIDENCED",
  requiredPermissionLevel: "granted",
  purpose: "DPP_COMPLIANCE",
};

export function pilotPropertiesForKind(kind: SubjectKind): PilotProperty[] {
  if (kind === "PRODUCT" || kind === "PRODUCT_FAMILY" || kind === "VARIANT") {
    return [{ propertyId: "country_of_manufacture", propertyLabel: "Country of manufacture", ...SHARED_EVIDENCE }];
  }
  if (kind === "PACKAGING") {
    return [{ propertyId: "recycled_content", propertyLabel: "Packaging recycled content", ...SHARED_EVIDENCE }];
  }
  if (kind === "MATERIAL" || kind === "RAW_MATERIAL") {
    return [
      { propertyId: "recycled_content", propertyLabel: "Recycled content", ...SHARED_EVIDENCE },
      { propertyId: "material_origin", propertyLabel: "Material origin", ...SHARED_EVIDENCE },
    ];
  }
  if (kind === "COMPONENT") {
    return [
      { propertyId: "recycled_content", propertyLabel: "Recycled content", ...SHARED_EVIDENCE },
      { propertyId: "material_origin", propertyLabel: "Material origin", ...SHARED_EVIDENCE },
    ];
  }
  return [];
}

export function requirementKey(subjectId: string, propertyId: string, datasetVersion = PILOT_DATASET_VERSION) {
  return `${datasetVersion}:${subjectId}:${propertyId}`;
}

export function buildPilotRequirement(args: {
  id: string;
  tenantId: string;
  subjectId: string;
  subjectLabel: string;
  productIds: string[];
  property: PilotProperty;
  now: Date;
}): InformationRequirement {
  return {
    id: args.id,
    tenantId: args.tenantId,
    subjectId: args.subjectId,
    subjectLabel: args.subjectLabel,
    productIds: args.productIds,
    propertyId: args.property.propertyId,
    propertyLabel: args.property.propertyLabel,
    datasetId: PILOT_DATASET_ID,
    datasetVersion: PILOT_DATASET_VERSION,
    purpose: args.property.purpose,
    requiredTrustLevel: args.property.requiredTrustLevel,
    requiredPermissionLevel: args.property.requiredPermissionLevel,
    requiredBy: new Date(args.now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    priority: 50,
    createdAt: args.now.toISOString(),
  };
}
