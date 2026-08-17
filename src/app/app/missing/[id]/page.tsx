"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { EvidenceLine, Mono, SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";
import { CaseStatePill, formatWhen } from "@/components/source/case-status";
import { caseHeadline, explainException, stateLabel } from "@/domain/source/copy";
import {
  actorLabelForViewer,
  attemptsForCase,
  caseReadiness,
  eventsForCase,
  requestForCase,
  requirementByCase,
  tasksForCase,
} from "@/domain/source/queries";
import { dispatchCommand, useEngineState } from "@/domain/source/store";

export default function ResolutionCasePage() {
  const params = useParams<{ id: string }>();
  const state = useEngineState();
  const resolution = state.cases.find((c) => c.id === params.id);
  if (!resolution) notFound();
  const requirement = requirementByCase(state, resolution.id);
  const request = requestForCase(state, resolution.id);
  const attempts = attemptsForCase(state, resolution.id);
  const events = eventsForCase(state, resolution.id);
  const tasks = tasksForCase(state, resolution.id);
  const readiness = caseReadiness(state, resolution.id);
  const exception = resolution.blockingReason ? explainException(resolution.blockingReason) : null;
  const conflict = state.conflicts.find((c) => c.caseId === resolution.id && !c.resolved);

  return (
    <div className="mx-auto max-w-3xl">
      <SourceLabel>Resolution case</SourceLabel>
      <h1 className="mt-2 font-[family-name:var(--font-space)] text-[33px] font-medium tracking-[-0.02em]">
        {resolution.id}
      </h1>
      <p className="mt-2 text-[14.5px] text-[#101A15]/70">{caseHeadline(resolution)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <CaseStatePill state={resolution.state} />
        {resolution.blockingReason ? (
          <StatusPill tone="attention">{resolution.blockingReason.replaceAll("_", " ")}</StatusPill>
        ) : null}
      </div>

      <dl className="mt-8 grid gap-4 sm:grid-cols-2">
        <Meta k="Need" v={requirement?.propertyLabel ?? "—"} />
        <Meta k="For" v={requirement?.subjectLabel ?? "—"} />
        <Meta k="Purpose" v={requirement?.purpose.replaceAll("_", " ") ?? "—"} />
        <Meta k="Required by" v={requirement?.requiredBy ?? "—"} />
        <Meta k="Current actor" v={actorLabelForViewer(state, resolution.currentActorId, true)} />
        <Meta k="Attempts" v={String(attempts.length)} />
        <Meta k="Escalation policy" v={resolution.escalationPolicyId} />
        <Meta k="Owner" v={resolution.ownerLabel ?? "—"} />
      </dl>

      <section className="mt-10 border border-[#101A15]/10 bg-[#FBFCFA] p-5">
        <SourceLabel>What happens next</SourceLabel>
        <p className="mt-2 text-[14.5px] leading-relaxed">{resolution.nextAction}</p>
        {resolution.nextActionAt ? (
          <p className="mt-2 font-[family-name:var(--font-plex)] text-[12px] text-[#101A15]/55">
            Next action at {formatWhen(resolution.nextActionAt)}
          </p>
        ) : null}
        <p className="mt-2 text-[13px] text-[#101A15]/65">
          Escalation owner: {resolution.ownerLabel ?? "Unassigned"}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {resolution.state === "WAITING_RESPONSE" || resolution.blockingReason === "NO_RESPONSE" ? (
            <SourceButton onClick={() => dispatchCommand({ type: "SEND_REMINDER", caseId: resolution.id })}>
              Send reminder now
            </SourceButton>
          ) : null}
          {resolution.currentActorId ? (
            <SourceButton
              variant="ghost"
              onClick={() => {
                const other = state.contacts.find(
                  (c) => c.actorId === resolution.currentActorId && c.valid && c.id !== request?.contactId
                );
                if (other) dispatchCommand({ type: "CHANGE_CONTACT", caseId: resolution.id, contactId: other.id });
              }}
            >
              Change contact
            </SourceButton>
          ) : null}
          <SourceButton variant="ghost" onClick={() => dispatchCommand({ type: "ESCALATE", caseId: resolution.id })}>
            Escalate
          </SourceButton>
          {resolution.state !== "UNRESOLVED" && resolution.state !== "READY" && resolution.state !== "MONITORING" ? (
            <SourceButton
              variant="ghost"
              onClick={() =>
                dispatchCommand({
                  type: "CLOSE_UNRESOLVED",
                  caseId: resolution.id,
                  explanation: "Closed from the workbench. Remaining options stay on the case.",
                })
              }
            >
              Mark unresolved
            </SourceButton>
          ) : null}
          {request ? (
            <SourceButton href={`/app/requests/${requestToDemoId(request.supplierId)}`} variant="ghost">
              Open request
            </SourceButton>
          ) : null}
          {resolution.portalToken ? (
            <SourceButton href={`/s/${resolution.portalToken}`} variant="ghost">
              Open supplier view
            </SourceButton>
          ) : null}
        </div>
      </section>

      {exception ? (
        <section className="mt-6 border border-[#101A15]/10 bg-[#FBFCFA] p-5">
          <SourceLabel>No dead ends</SourceLabel>
          <h2 className="mt-2 font-[family-name:var(--font-space)] text-[20px]">{exception.headline}</h2>
          <EvidenceLine className="mt-3" />
          <dl className="mt-4 space-y-3 text-[13px]">
            <Row k="Reason" v={exception.reason} />
            <Row k="Owner" v={resolution.ownerLabel ?? "Unassigned"} />
            <Row k="Next possible action" v={exception.nextAction} />
            <Row k="Automation policy" v={exception.automationPolicy} />
            <Row k="Escalation deadline" v={formatWhen(resolution.nextActionAt)} />
          </dl>
        </section>
      ) : null}

      <section className="mt-8">
        <SourceLabel>Why is this not ready?</SourceLabel>
        <ul className="mt-3 space-y-1 font-[family-name:var(--font-plex)] text-[12px]">
          {Object.entries(readiness.gates).map(([gate, result]) => (
            <li key={gate} className="flex justify-between border-b border-[#101A15]/8 py-1.5">
              <span>{gate}</span>
              <span className={result === "pass" ? "text-[#0B6E50]" : "text-[#B26B2C]"}>{result}</span>
            </li>
          ))}
        </ul>
        {readiness.blockingReason ? (
          <p className="mt-3 text-[13px] text-[#101A15]/70">
            Blocking reason: {readiness.blockingReason.replaceAll("_", " ")}
          </p>
        ) : (
          <p className="mt-3 text-[13px] text-[#0B6E50]">All gates pass.</p>
        )}
      </section>

      {conflict ? (
        <section className="mt-8 border border-[#B26B2C]/30 bg-[#FBFCFA] p-5">
          <SourceLabel>Conflicting evidence detected</SourceLabel>
          <p className="mt-2 text-[14.5px]">
            {conflict.leftLabel}: {conflict.leftValue} · {conflict.rightLabel}: {conflict.rightValue}
          </p>
          <p className="mt-2 text-[13px] text-[#101A15]/65">
            SOURCE will not pick the newest document unless a dataset rule says so.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <SourceButton
              onClick={() =>
                dispatchCommand({ type: "RESOLVE_CONFLICT", caseId: resolution.id, outcome: "manual_adjudication" })
              }
            >
              Adjudicate
            </SourceButton>
            <SourceButton
              variant="ghost"
              onClick={() =>
                dispatchCommand({ type: "RESOLVE_CONFLICT", caseId: resolution.id, outcome: "different_facility" })
              }
            >
              Different facility
            </SourceButton>
          </div>
        </section>
      ) : null}

      {resolution.state === "IDENTITY_REVIEW" ? (
        <section className="mt-8 border border-[#101A15]/10 bg-[#FBFCFA] p-5">
          <SourceLabel>Identity review</SourceLabel>
          <p className="mt-2 text-[14.5px]">Are these the same supplier? Evidence will not auto-link until you decide.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <SourceButton
              onClick={() =>
                dispatchCommand({
                  type: "CONFIRM_IDENTITY",
                  caseId: resolution.id,
                  decision: "confirm",
                  actorId: "acme-alu-gmbh",
                })
              }
            >
              Confirm
            </SourceButton>
            <SourceButton
              variant="ghost"
              onClick={() => dispatchCommand({ type: "CONFIRM_IDENTITY", caseId: resolution.id, decision: "reject" })}
            >
              Reject
            </SourceButton>
            <SourceButton
              variant="ghost"
              onClick={() => dispatchCommand({ type: "CONFIRM_IDENTITY", caseId: resolution.id, decision: "create_new" })}
            >
              Create new
            </SourceButton>
          </div>
        </section>
      ) : null}

      {resolution.state === "AUTHORIZATION_REQUIRED" ? (
        <div className="mt-8">
          <SourceButton onClick={() => dispatchCommand({ type: "GRANT_PERMISSION", caseId: resolution.id })}>
            Record supplier authorization
          </SourceButton>
        </div>
      ) : null}

      {tasks.length ? (
        <section className="mt-10">
          <h2 className="font-[family-name:var(--font-space)] text-[20px]">Human tasks</h2>
          <ul className="mt-3 space-y-3">
            {tasks.map((task) => (
              <li key={task.id} className="border border-[#101A15]/10 bg-[#FBFCFA] p-4">
                <p className="text-[14.5px]">{task.title}</p>
                <p className="mt-1 text-[13px] text-[#101A15]/65">{task.context}</p>
                <p className="mt-2 text-[13px]">Recommended: {task.recommendedAction}</p>
                <SourceLabel className="mt-2 block">
                  {task.ownerLabel} · {task.status}
                </SourceLabel>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-space)] text-[20px]">Attempts</h2>
        <ol className="mt-3 space-y-2 text-[13px]">
          {attempts.map((attempt) => (
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
          {events.map((event) => (
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

      <p className="mt-10 text-[12px] text-[#101A15]/50">
        Case state {stateLabel(resolution.state)}. Request state is separate
        {request ? `: ${request.status.replaceAll("_", " ")}` : ""}.
      </p>
      {requirement?.productIds[0] ? (
        <p className="mt-2">
          <Link href={`/app/products/${requirement.productIds[0]}`} className="text-[13px] hover:underline">
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[#101A15]/55">{k}</dt>
      <dd className="max-w-[28rem] text-right">{v}</dd>
    </div>
  );
}

function requestToDemoId(supplierId: string) {
  if (supplierId === "supplier-a") return "req-supplier-a";
  if (supplierId === "supplier-b") return "req-supplier-b";
  return "req-supplier-a";
}
