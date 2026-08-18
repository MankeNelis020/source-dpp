import { IDENTITY_ENGINE_VERSION, type Actor, type IdentityEngineVersion, type IdentityStatus } from "./types";

export { IDENTITY_ENGINE_VERSION };
export const IDENTITY_SCORES_ARE_CALIBRATED = false;

export interface IdentityQuery {
  name?: string;
  vat?: string;
  lei?: string;
  domain?: string;
  country?: string;
  gtin?: string;
  mpn?: string;
}

export interface IdentityCandidate {
  actor: Actor;
  confidence: number;
  method: "exact" | "normalized" | "probabilistic" | "contextual";
}

export interface IdentityResolution {
  status: IdentityStatus;
  candidates: IdentityCandidate[];
  selected?: Actor;
  autoLinkAllowed: boolean;
  modelVersion: IdentityEngineVersion;
  scoresAreCalibrated: false;
}

function normalize(value?: string): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\b(gmbh|bv|srl|ltd|inc|ag|oy|ab|co|kg)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function scoreActor(query: IdentityQuery, actor: Actor): IdentityCandidate | null {
  if (query.vat && actor.vat && query.vat.replace(/\s/g, "") === actor.vat.replace(/\s/g, "")) {
    return { actor, confidence: 99.8, method: "exact" };
  }
  if (query.lei && actor.lei && query.lei === actor.lei) {
    return { actor, confidence: 99.9, method: "exact" };
  }
  if (query.domain && actor.domain && query.domain.toLowerCase() === actor.domain.toLowerCase()) {
    return { actor, confidence: 96, method: "normalized" };
  }

  const qName = normalize(query.name);
  const aName = normalize(actor.name);
  const aLegal = normalize(actor.legalName);
  if (!qName) return null;

  if (qName === aName || qName === aLegal) {
    const countryBoost = query.country && query.country === actor.country ? 2 : 0;
    return { actor, confidence: 92 + countryBoost, method: "normalized" };
  }

  if (aLegal.includes(qName) || qName.includes(aName) || aName.includes(qName)) {
    return { actor, confidence: 81, method: "probabilistic" };
  }

  return null;
}

export function resolveIdentity(
  query: IdentityQuery,
  actors: Actor[],
  autoLinkThreshold: number
): IdentityResolution {
  const candidates = actors
    .map((actor) => scoreActor(query, actor))
    .filter((item): item is IdentityCandidate => item !== null)
    .sort((a, b) => b.confidence - a.confidence);

  const probable = candidates.filter((c) => c.confidence >= 80);

  const meta = {
    modelVersion: IDENTITY_ENGINE_VERSION,
    scoresAreCalibrated: false as const,
  };

  if (probable.length === 0) {
    return { status: "IDENTITY_NOT_FOUND", candidates, autoLinkAllowed: false, ...meta };
  }

  if (probable.length > 1 && Math.abs(probable[0].confidence - probable[1].confidence) < 5) {
    return { status: "IDENTITY_AMBIGUOUS", candidates: probable, autoLinkAllowed: false, ...meta };
  }

  const top = probable[0];
  if (top.confidence >= autoLinkThreshold) {
    return {
      status: "IDENTITY_MATCHED",
      candidates: probable,
      selected: top.actor,
      autoLinkAllowed: true,
      ...meta,
    };
  }

  return {
    status: "IDENTITY_PROBABLE",
    candidates: probable,
    selected: top.actor,
    autoLinkAllowed: false,
    ...meta,
  };
}
