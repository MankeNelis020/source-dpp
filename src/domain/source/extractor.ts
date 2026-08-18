import type { EvidenceRecord } from "./types";

export interface CandidateClaim {
  propertyId: string;
  value: string;
  unit?: string;
  documentRef?: string;
  page?: string;
  rawText?: string;
  extractorVersion: string;
  reviewRequired: boolean;
}

export interface EvidenceExtractor {
  extract(evidence: EvidenceRecord, requestedProperties: string[]): Promise<CandidateClaim[]>;
}

/** Deterministic stub. Never marks READY. Uses already-stored extractedValue only. */
export class FilenameEvidenceExtractor implements EvidenceExtractor {
  async extract(evidence: EvidenceRecord, requestedProperties: string[]): Promise<CandidateClaim[]> {
    if (!evidence.extractedValue) return [];
    return requestedProperties.map((propertyId) => ({
      propertyId,
      value: evidence.extractedValue!,
      documentRef: evidence.id,
      rawText: evidence.extractedValue,
      extractorVersion: "filename-stub-v1",
      reviewRequired: (evidence.extractionConfidence ?? 0) < 95,
    }));
  }
}
