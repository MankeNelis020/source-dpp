"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { EvidenceLine, Mono, SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";
import { CaseStatePill, formatWhen } from "@/components/source/case-status";
import { stateLabel } from "@/domain/source/copy";
import { useDispatchCommand, useSourceQuery } from "@/client/source/api";
import type { ResolutionCaseState } from "@/domain/source";

interface CaseDetail {
  id: string;
  state: ResolutionCaseState;
  version: number;
  nextAction: string;
  nextActionAt?: string;
  blockingReason?: string;
  ownerLabel?: string;
  actorLabel: string;
  identityModelVersion: string;
  identityScoresAreCalibrated: boolean;
  actor?: { kind: string; sourceType?: string; name?: string; id?: string };
  identityCandidates?: { id: string; name?: string; legalName?: string; country?: string }[];
  requirement?: { propertyLabel: string; subjectLabel: string; purpose: string; requiredBy: string; productIds: string[] };
  request?: { id: string; status: string };
  attempts: { id: string; method: string; status: string; costEstimate: number; parentAttemptId?: string }[];
  events: { id: string; timestamp: string; detail: string; policy?: string }[];
  tasks: { id: string; title: string; context: string; recommendedAction: string; ownerLabel: string; status: string }[];
  readiness: { gates: Record<string, string>; ready: boolean; blockingReason?: string };
  exception?: { headline: string; reason: string; nextAction: string; automationPolicy: string };
  conflict?: { leftLabel: string; leftValue: string; rightLabel: string; rightValue: string };
  claim?: {
    id: string;
    value?: string;
    unit?: string;
    ready: boolean;
    trustLevel: string;
    trustLabel?: string;
    verificationSummary?: string;
  };
  evidenceSummary?: {
    status: string;
    evidenceStrengthLabel?: string;
    evidenceSource: string;
    disclosureLabel?: string;
    originalEvidenceLabel: string;
    sufficiency?: string;
    sufficiencyReason?: string;
  };
  contacts: { id: string; role: string; name: string; valid: boolean }[];
  delivery?: {
    status: string;
    label: string;
    queuedAt?: string;
    providerAcceptedAt?: string;
    deliveredAt?: string;
    bouncedAt?: string;
    nextReminderAt?: string;
  };
}

export default function ResolutionCasePage() {
  const params = useParams<{ id: string }>();
  const { data: resolution, error, reload } = useSourceQuery<CaseDetail>(params.id ? `/api/source/cases/${params.id}` : null);
  const dispatch = useDispatchCommand();
  const [notice, setNotice] = useState<string | null>(null);

  async function run(command: Parameters<typeof dispatch>[0]) {
    try {
      await dispatch(command, { expectedVersion: resolution?.version });
      setNotice(null);
      await reload();
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      setNotice(code === "CASE_CHANGED" ? "This case changed while you were working. Refresh to continue." : err instanceof Error ? err.message : "Request failed");
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-[family-name:var(--font-space)] text-[28px]">Resource unavailable.</h1>
        <p className="mt-2 text-[13px] text-[#101A15]/65">{error}</p>
      </div>
    );
  }
  if (!resolution) return <p className="text-[13px] text-[#101A15]/50">Loading case…</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <SourceLabel>Missing information</SourceLabel>
      <h1 className="mt-2 font-[family-name:var(--font-space)] text-[33px] font-medium tracking-[-0.02em]">
        {resolution.requirement?.propertyLabel ?? "This gap"}
      </h1>
      <p className="mt-2 text-[14.5px] text-[#101A15]/70">{resolution.exception?.headline ?? resolution.nextAction}</p>
      {notice ? <p className="mt-3 text-[13px] text-[#B26B2C]">{notice}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <CaseStatePill state={resolution.state} />
        {resolution.blockingReason ? <StatusPill tone="attention">{resolution.blockingReason.replaceAll("_", " ")}</StatusPill> : null}
      </div>

      <dl className="mt-8 grid gap-4 sm:grid-cols-2">
        <Meta k="Need" v={resolution.requirement?.propertyLabel ?? "—"} />
        <Meta k="For" v={resolution.requirement?.subjectLabel ?? "—"} />
        <Meta k="Purpose" v={resolution.requirement?.purpose.replaceAll("_", " ") ?? "—"} />
        <Meta k="Required by" v={resolution.requirement?.requiredBy ?? "—"} />
        <Meta k="Who SOURCE asked" v={resolution.actorLabel} />
        <Meta k="Times SOURCE has tried" v={String(resolution.attempts.length)} />
        <Meta k="Owner" v={resolution.ownerLabel ?? "—"} />
        <Meta k="Identity model" v={`${resolution.identityModelVersion} · not a calibrated probability`} />
        {resolution.evidenceSummary ? (
          <>
            <Meta k="Status" v={resolution.evidenceSummary.status} />
            <Meta k="Evidence strength" v={resolution.evidenceSummary.evidenceStrengthLabel ?? "—"} />
            <Meta k="Evidence source" v={resolution.evidenceSummary.evidenceSource} />
            <Meta k="Disclosure" v={resolution.evidenceSummary.disclosureLabel ?? "—"} />
            <Meta k="Original evidence" v={resolution.evidenceSummary.originalEvidenceLabel} />
          </>
        ) : null}
        {resolution.claim?.verificationSummary ? <Meta k="Verification" v={resolution.claim.verificationSummary} /> : null}
        {resolution.claim?.value ? (
          <Meta k="Derived claim" v={`${resolution.claim.value}${resolution.claim.unit ? ` ${resolution.claim.unit}` : ""}`} />
        ) : null}
      </dl>
      {resolution.evidenceSummary?.sufficiencyReason ? (
        <p className="mt-4 text-[13px] text-[#101A15]/70">{resolution.evidenceSummary.sufficiencyReason}</p>
      ) : null}

      <section className="mt-10 border border-[#101A15]/10 bg-[#FBFCFA] p-5">
        <SourceLabel>What happens next</SourceLabel>
        <p className="mt-2 text-[14.5px] leading-relaxed">
          {resolution.delivery?.status === "BOUNCED"
            ? "Email could not be delivered. SOURCE needs another contact."
            : resolution.delivery?.label ?? resolution.nextAction}
        </p>
        {resolution.delivery?.queuedAt ? (
          <p className="mt-2 font-[family-name:var(--font-plex)] text-[12px] text-[#101A15]/55">
            Requested {formatWhen(resolution.delivery.queuedAt)}
            {resolution.delivery.deliveredAt ? ` · Email delivered ${formatWhen(resolution.delivery.deliveredAt)}` : ""}
            {resolution.delivery.providerAcceptedAt && !resolution.delivery.deliveredAt
              ? ` · Email sent ${formatWhen(resolution.delivery.providerAcceptedAt)}`
              : ""}
          </p>
        ) : null}
        {resolution.nextActionAt && resolution.delivery?.status !== "BOUNCED" && resolution.delivery?.status !== "COMPLAINED" ? (
          <p className="mt-2 font-[family-name:var(--font-plex)] text-[12px] text-[#101A15]/55">
            Next reminder {formatWhen(resolution.nextActionAt)}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          {resolution.state === "WAITING_RESPONSE" || resolution.blockingReason === "NO_RESPONSE" ? (
            <SourceButton onClick={() => void run({ type: "SEND_REMINDER", caseId: resolution.id })}>Send reminder now</SourceButton>
          ) : null}
          {resolution.contacts[0] ? (
            <SourceButton
              variant="ghost"
              onClick={() => {
                const other = resolution.contacts.find((c) => c.valid);
                if (other) void run({ type: "CHANGE_CONTACT", caseId: resolution.id, contactId: other.id });
              }}
            >
              Change contact
            </SourceButton>
          ) : null}
          <SourceButton variant="ghost" onClick={() => void run({ type: "ESCALATE", caseId: resolution.id })}>
            Escalate
          </SourceButton>
          {resolution.state !== "UNRESOLVED" && resolution.state !== "READY" && resolution.state !== "MONITORING" ? (
            <SourceButton
              variant="ghost"
              onClick={() =>
                void run({
                  type: "CLOSE_UNRESOLVED",
                  caseId: resolution.id,
                  explanation: "Closed from the workbench. Remaining options stay on the case.",
                })
              }
            >
              Mark unresolved
            </SourceButton>
          ) : null}
        </div>
      </section>

      {resolution.exception ? (
        <section className="mt-6 border border-[#101A15]/10 bg-[#FBFCFA] p-5">
          <SourceLabel>No dead ends</SourceLabel>
          <h2 className="mt-2 font-[family-name:var(--font-space)] text-[20px]">{resolution.exception.headline}</h2>
          <EvidenceLine className="mt-3" />
          <p className="mt-3 text-[13px]">{resolution.exception.reason}</p>
        </section>
      ) : null}

      <section className="mt-8">
        <SourceLabel>Why is this not ready?</SourceLabel>
        <ul className="mt-3 space-y-1 font-[family-name:var(--font-plex)] text-[12px]">
          {Object.entries(resolution.readiness.gates).map(([gate, result]) => (
            <li key={gate} className="flex justify-between border-b border-[#101A15]/8 py-1.5">
              <span>{gate}</span>
              <span className={result === "pass" ? "text-[#0B6E50]" : "text-[#B26B2C]"}>{result}</span>
            </li>
          ))}
        </ul>
      </section>

      {resolution.conflict ? (
        <section className="mt-8 border border-[#B26B2C]/30 bg-[#FBFCFA] p-5">
          <SourceLabel>Conflicting evidence detected</SourceLabel>
          <p className="mt-2 text-[14.5px]">
            {resolution.conflict.leftLabel}: {resolution.conflict.leftValue} · {resolution.conflict.rightLabel}: {resolution.conflict.rightValue}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <SourceButton onClick={() => void run({ type: "RESOLVE_CONFLICT", caseId: resolution.id, outcome: "manual_adjudication" })}>
              Adjudicate
            </SourceButton>
            <SourceButton variant="ghost" onClick={() => void run({ type: "RESOLVE_CONFLICT", caseId: resolution.id, outcome: "different_facility" })}>
              Different facility
            </SourceButton>
          </div>
        </section>
      ) : null}

      {resolution.state === "IDENTITY_REVIEW" ? (
        <section className="mt-8 border border-[#101A15]/10 bg-[#FBFCFA] p-5">
          <SourceLabel>Identity review</SourceLabel>
          <p className="mt-2 text-[14.5px]">We&apos;re not sure these are the same supplier. Evidence will not auto-link until you decide.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <SourceButton
              onClick={() =>
                void run({
                  type: "CONFIRM_IDENTITY",
                  caseId: resolution.id,
                  decision: "confirm",
                  actorId: resolution.identityCandidates?.[0]?.id ?? resolution.actor?.id,
                })
              }
              disabled={!resolution.identityCandidates?.[0]?.id && !resolution.actor?.id}
            >
              Confirm {resolution.identityCandidates?.[0]?.name ?? resolution.actorLabel}
            </SourceButton>
            <SourceButton variant="ghost" onClick={() => void run({ type: "CONFIRM_IDENTITY", caseId: resolution.id, decision: "reject" })}>
              Not the same
            </SourceButton>
          </div>
        </section>
      ) : null}

      {resolution.state === "AUTHORIZATION_REQUIRED" ? (
        <div className="mt-8">
          <SourceButton onClick={() => void run({ type: "GRANT_PERMISSION", caseId: resolution.id })}>
            Record supplier authorization
          </SourceButton>
        </div>
      ) : null}

      {resolution.tasks.length ? (
        <section className="mt-10">
          <h2 className="font-[family-name:var(--font-space)] text-[20px]">Human tasks</h2>
          <ul className="mt-3 space-y-3">
            {resolution.tasks.map((task) => (
              <li key={task.id} className="border border-[#101A15]/10 bg-[#FBFCFA] p-4">
                <p className="text-[14.5px]">{task.title}</p>
                <p className="mt-1 text-[13px] text-[#101A15]/65">{task.context}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-space)] text-[20px]">Attempts</h2>
        <ol className="mt-3 space-y-2 text-[13px]">
          {resolution.attempts.map((attempt) => (
            <li key={attempt.id} className="flex justify-between gap-4 border-b border-[#101A15]/8 py-2">
              <span>
                {attempt.method.replaceAll("_", " ")}
                {attempt.parentAttemptId ? " · upstream of previous attempt" : ""}
              </span>
              <Mono className="text-[12px] text-[#101A15]/55">
                {attempt.status} · €{attempt.costEstimate}
              </Mono>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-space)] text-[20px]">Audit history</h2>
        <ol className="mt-3 space-y-2">
          {resolution.events.map((event) => (
            <li key={event.id} className="flex gap-4 text-[13px]">
              <span className="w-36 shrink-0 font-[family-name:var(--font-plex)] text-[12px] text-[#101A15]/50">
                {formatWhen(event.timestamp)}
              </span>
              <span>
                {event.detail}
                {event.policy ? ` · ${event.policy}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-10 text-[12px] text-[#101A15]/50">Case state {stateLabel(resolution.state)}.</p>
      {resolution.requirement?.productIds[0] ? (
        <p className="mt-2">
          <Link href={`/app/products/${resolution.requirement.productIds[0]}`} className="text-[13px] hover:underline">
            View product
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <SourceLabel>{k}</SourceLabel>
      <div className="mt-1 font-[family-name:var(--font-plex)] text-[12px]">{v}</div>
    </div>
  );
}
