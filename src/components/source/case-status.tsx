import { StatusPill } from "@/components/source/ui";
import type { ExceptionCode, ResolutionCaseState } from "@/domain/source";

export function caseTone(
  state: ResolutionCaseState
): "signal" | "attention" | "teal" | "muted" | "neutral" {
  if (state === "READY" || state === "RETURNED" || state === "MONITORING") return "signal";
  if (state === "UNRESOLVED" || state === "CONFLICT" || state === "CONTACT_REQUIRED") return "attention";
  if (state === "WAITING_UPSTREAM" || state === "AUTHORIZATION_REQUIRED" || state === "NDA_REQUIRED") return "teal";
  if (state === "WAITING_RESPONSE" || state === "RENEWAL_REQUIRED") return "attention";
  return "muted";
}

export function exceptionTone(code?: ExceptionCode): "signal" | "attention" | "teal" | "muted" {
  if (!code) return "signal";
  if (code === "UNRESOLVABLE" || code === "EVIDENCE_CONFLICT" || code === "VALUE_EVIDENCE_CONFLICT") return "attention";
  if (code === "CONFIDENTIAL" || code === "AUTHORIZATION_REQUIRED" || code === "UPSTREAM_REQUIRED") return "teal";
  return "attention";
}

export function CaseStatePill({ state }: { state: ResolutionCaseState }) {
  return <StatusPill tone={caseTone(state)}>{state.replaceAll("_", " ")}</StatusPill>;
}

export function formatWhen(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
