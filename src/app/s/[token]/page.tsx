"use client";

import { Suspense, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { SourceWordmark } from "@/components/source/wordmark";
import { EvidenceLine, SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";
import { SUPPLIER_ACTIONS, SUPPLIER_DISCLOSURE_MODES, SUPPLIER_REUSE_CHOICES } from "@/domain/source/copy";
import { uploadSourceFile, usePortalCommand, useSourceQuery } from "@/client/source/api";
import type {
  CannotProvideReason,
  DisclosureMode,
  EvidenceReusePolicy,
  EvidenceRoute,
  UpstreamContactMode,
} from "@/domain/source";
import {
  clearDraftForCase,
  dispatchCopy,
  draftForCase,
  outreachQueued,
  parsePortalSearch,
  patchDraftForCase,
  portalPath,
  type PortalActionId,
  type PortalDraftMap,
  type UnknownRoute,
} from "../portal-draft";

interface PortalView {
  requesterName: string;
  actorId: string;
  actorName?: string;
  allowedCommands: string[];
  package?: { products: string[]; requirementLabels: string[] };
  knownUpstream?: { id: string; name: string; contacts: { name: string; email: string }[] }[];
  ownContacts?: { name: string; email: string }[];
  disclosure?: {
    terms: {
      agreementId: string;
      version: string;
      effectiveDate: string;
      hash: string;
      title: string;
      purpose: string;
      retentionSummary: string;
      reuseSummary: string;
      legalReviewStatus?: string;
      sections: { heading: string; body: string }[];
      fullText: string;
    };
    why: string;
    who: string;
    howUsed: string[];
    originalVisibility: string;
    derivedData: string;
    reuse: string;
    retention: string;
  };
  acceptance?: {
    id: string;
    authorityConfirmed: boolean;
    termsAccepted: boolean;
    agreementVersion: string;
    acceptedAt?: string;
    reusePolicy: EvidenceReusePolicy;
  } | null;
  questions: {
    id: string;
    version: number;
    state: string;
    propertyLabel?: string;
    subjectLabel?: string;
    nextAction: string;
    purpose?: string;
    requiredBy?: string;
    productNames?: string[];
    whyRequested?: string;
    submitted?: boolean;
    requirementId?: string;
    subjectId?: string;
  }[];
  reuseRequests?: {
    id: string;
    caseId: string;
    status: string;
    evidenceLabel?: string;
    originalUse?: string;
    proposedUse?: string;
    proposedProducts?: string[];
    requesterName: string;
    purpose?: string;
    purposeLabel?: string;
    disclosureLabel?: string;
    propertyLabel?: string;
  }[];
}

const ROUTE_BY_ACTION: Partial<Record<PortalActionId, EvidenceRoute>> = {
  original: "ORIGINAL_DOCUMENT",
  alternative: "ALTERNATIVE_DOCUMENT",
  attest: "SUPPLIER_ATTESTATION",
  cannot: "CANNOT_PROVIDE",
};

export default function SupplierPortalPage() {
  return (
    <Suspense fallback={<div className="mx-auto min-h-full max-w-lg px-5 py-16 text-[13px] text-[#101A15]/50">Loading…</div>}>
      <SupplierPortal />
    </Suspense>
  );
}

function SupplierPortal() {
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsed = parsePortalSearch(searchParams);
  const { data, error, errorCode, reload } = useSourceQuery<PortalView>(token ? `/api/portal/${encodeURIComponent(token)}` : null);
  const runCommand = usePortalCommand(token);
  const questions = useMemo(() => data?.questions ?? [], [data?.questions]);
  const openQuestions = useMemo(() => questions.filter((q) => !q.submitted && q.state !== "READY"), [questions]);
  const accepted = Boolean(data?.acceptance?.authorityConfirmed && data?.acceptance?.termsAccepted);
  const answeredCount = questions.filter((q) => q.submitted || q.state === "READY").length;

  const [drafts, setDrafts] = useState<PortalDraftMap>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadState, setUploadState] = useState<string | null>(null);
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showFullTerms, setShowFullTerms] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const pendingReuse = useMemo(
    () => (data?.reuseRequests ?? []).filter((row) => row.status === "PENDING"),
    [data?.reuseRequests]
  );

  const step = parsed.view === "terms" ? "protocol" : parsed.view === "request" ? "list" : parsed.view === "requirement" ? "act" : parsed.view === "done" ? "done" : "land";
  const caseId = parsed.caseId;
  const current = useMemo(
    () => questions.find((item) => item.id === caseId) ?? openQuestions.find((item) => item.id === caseId),
    [questions, openQuestions, caseId]
  );
  const draft = caseId ? draftForCase(drafts, caseId) : draftForCase({}, "");
  const progressIndex = Math.max(0, questions.findIndex((item) => item.id === caseId));

  function go(view: "land" | "terms" | "request" | "requirement" | "done", nextCase?: string | null) {
    if (!token) return;
    router.push(portalPath(token, view, nextCase));
  }

  function patch(next: Partial<typeof draft>) {
    if (!caseId) return;
    setDrafts((map) => patchDraftForCase(map, caseId, next));
  }

  function finish(text: string, extra?: string, submittedCaseId?: string) {
    setMessage(text);
    setConfirmation(extra ?? null);
    if (submittedCaseId) setDrafts((map) => clearDraftForCase(map, submittedCaseId));
    go("done", submittedCaseId ?? caseId);
    void reload();
  }

  async function acceptTerms() {
    const first = openQuestions[0];
    if (!first || busy || !token || !data?.disclosure) return;
    setBusy(true);
    try {
      await runCommand({
        type: "ACCEPT_EVIDENCE_DISCLOSURE",
        caseId: first.id,
        authorityConfirmed,
        termsAccepted,
        agreementId: data.disclosure.terms.agreementId,
        agreementVersion: data.disclosure.terms.version,
        reusePolicy: "REUSE_WITHIN_REQUESTING_ORGANISATION",
      });
      go("request");
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "The terms could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  async function decideReuse(row: NonNullable<PortalView["reuseRequests"]>[number], decision: "APPROVED" | "DECLINED") {
    if (busy || !token) return;
    setBusy(true);
    try {
      await runCommand({
        type: "DECIDE_EVIDENCE_REUSE",
        caseId: row.caseId,
        consentId: row.id,
        decision,
      });
      if (decision === "DECLINED") {
        go("requirement", row.caseId);
        setMessage(null);
        await reload();
        return;
      }
      finish(
        "Reuse authorised for this request. SOURCE will assess whether the evidence is sufficient. Approval does not change how the original file may be disclosed.",
        "response received",
        row.caseId
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "The reuse decision could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  const askingSupplier = draft.action === "upstream" || (draft.action === "unknown" && draft.unknownRoute === "ask_supplier");
  const assigningColleague = draft.action === "colleague" || (draft.action === "unknown" && draft.unknownRoute === "assign_colleague");
  const matchedUpstream = data?.knownUpstream?.find(
    (item) => item.name.trim().toLowerCase() === draft.upstreamName.trim().toLowerCase()
  );
  const suggestedContact = matchedUpstream?.contacts[0];

  async function run() {
    if (!current || busy || !token) return;
    setBusy(true);
    try {
      const route = draft.action ? ROUTE_BY_ACTION[draft.action] : undefined;
      if (route === "ORIGINAL_DOCUMENT" || route === "ALTERNATIVE_DOCUMENT" || route === "SUPPLIER_ATTESTATION" || route === "CANNOT_PROVIDE") {
        let storageObjectId: string | undefined;
        if (route === "ORIGINAL_DOCUMENT" || route === "ALTERNATIVE_DOCUMENT") {
          if (!draft.evidenceFile) {
            setBusy(false);
            setMessage("Choose a supporting file first.");
            return;
          }
          setUploadState("Uploading…");
          const stored = await uploadSourceFile({
            purpose: "EVIDENCE",
            file: draft.evidenceFile,
            caseId: current.id,
            portalToken: token,
          });
          storageObjectId = stored.id;
          setUploadState("File received.");
        }
        await runCommand({
          type: "SUBMIT_RESPONSE",
          caseId: current.id,
          value: route === "SUPPLIER_ATTESTATION" ? draft.attestation.statement : draft.value,
          unit: "%",
          evidence:
            route === "ORIGINAL_DOCUMENT" || route === "ALTERNATIVE_DOCUMENT"
              ? { filename: draft.evidenceFile?.name ?? "upload", storageObjectId }
              : undefined,
          permission: "GRANTED",
          evidenceRoute: route,
          disclosureMode: route === "CANNOT_PROVIDE" ? "CANNOT_DISCLOSE" : draft.disclosureMode,
          reusePolicy: draft.reusePolicy,
          supportsCaseIds: draft.supportIds.filter((id) => id !== current.id),
          cannotProvideReason: route === "CANNOT_PROVIDE" ? draft.cannotReason : undefined,
          attestation:
            route === "SUPPLIER_ATTESTATION"
              ? {
                  legalEntity: draft.attestation.legalEntity,
                  personName: draft.attestation.personName,
                  role: draft.attestation.role,
                  statement: draft.attestation.statement,
                  productIds: current.productNames ?? [],
                  requirementIds: [current.propertyLabel ?? current.id],
                }
              : undefined,
        });
        const modeLabel =
          route === "CANNOT_PROVIDE"
            ? "cannot disclose"
            : SUPPLIER_DISCLOSURE_MODES.find((item) => item.id === draft.disclosureMode)?.label ?? draft.disclosureMode;
        finish(
          route === "CANNOT_PROVIDE"
            ? "Recorded. This does not resolve the requirement. SOURCE will keep the gap open."
            : route === "SUPPLIER_ATTESTATION"
              ? "Declaration received. SOURCE will assess whether it is sufficient. A declaration is not automatically proof."
              : "Evidence received. SOURCE will assess whether it supports this requirement.",
          `${route.replaceAll("_", " ").toLowerCase()} · ${modeLabel}. response received`,
          current.id
        );
        return;
      }
      if (draft.action === "unknown" && draft.unknownRoute === "cannot_determine") {
        await runCommand({ type: "MARK_UNKNOWN", caseId: current.id, choice: "do_not_have" });
        const copy = dispatchCopy({ kind: "unknown", queued: false, hasEmail: false, hasOrganisation: false });
        finish(copy.message, copy.confirmation, current.id);
        return;
      }
      if (askingSupplier) {
        if (!draft.upstreamName.trim()) {
          setBusy(false);
          setMessage("Name the supplier organisation first.");
          return;
        }
        if (draft.action === "unknown") {
          await runCommand({ type: "MARK_UNKNOWN", caseId: current.id, choice: "ask_supplier" });
        }
        const result = await runCommand({
          type: "FORWARD_UPSTREAM",
          caseId: current.id,
          upstream: {
            id: matchedUpstream?.id,
            name: draft.upstreamName.trim(),
            legalName: draft.upstreamName.trim(),
            country: "Unknown",
            email: draft.upstreamEmail.trim() || undefined,
            contactName: draft.upstreamContactName.trim() || undefined,
          },
          mode: draft.upstreamMode,
        });
        const copy = dispatchCopy({
          kind: "upstream",
          queued: outreachQueued(result),
          hasEmail: Boolean(draft.upstreamEmail.trim()),
          hasOrganisation: true,
        });
        finish(copy.message, copy.confirmation, current.id);
        return;
      }
      if (assigningColleague) {
        if (!draft.colleagueEmail.trim()) {
          setBusy(false);
          setMessage("Enter a work email first.");
          return;
        }
        if (draft.action === "unknown") {
          await runCommand({ type: "MARK_UNKNOWN", caseId: current.id, choice: "assign_colleague" });
        }
        const result = await runCommand({
          type: "ASSIGN_COLLEAGUE",
          caseId: current.id,
          contact: {
            actorId: data?.actorId ?? "",
            role: "compliance",
            name: draft.colleagueName.trim() || "Colleague",
            email: draft.colleagueEmail.trim(),
          },
        });
        const copy = dispatchCopy({
          kind: "colleague",
          queued: outreachQueued(result),
          hasEmail: true,
          hasOrganisation: false,
        });
        finish(copy.message, copy.confirmation, current.id);
        return;
      }
      if (draft.action === "wrong") {
        if (!draft.colleagueEmail.trim()) {
          setBusy(false);
          setMessage("Enter a better contact email first.");
          return;
        }
        const result = await runCommand({
          type: "MARK_WRONG_CONTACT",
          caseId: current.id,
          mode: "provide_contact",
          contact: { role: "compliance", name: draft.colleagueName.trim() || "Colleague", email: draft.colleagueEmail.trim() },
        });
        const copy = dispatchCopy({
          kind: "colleague",
          queued: outreachQueued(result),
          hasEmail: true,
          hasOrganisation: false,
        });
        finish(copy.message, copy.confirmation, current.id);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto min-h-full max-w-lg px-5 py-16">
        <SourceWordmark />
        <h1 className="mt-10 font-[family-name:var(--font-space)] text-[28px] font-medium">This link is unavailable.</h1>
      </div>
    );
  }

  if (error) {
    const title =
      errorCode === "EXPIRED"
        ? "This request link has expired."
        : errorCode === "REVOKED"
          ? "This request link has been withdrawn."
          : "This link is unavailable.";
    return (
      <div className="mx-auto min-h-full max-w-lg px-5 py-16">
        <SourceWordmark />
        <h1 className="mt-10 font-[family-name:var(--font-space)] text-[28px] font-medium">{title}</h1>
        <p className="mt-3 text-[13px] text-[#101A15]/65">{error}</p>
      </div>
    );
  }

  if (data && questions.length > 0 && openQuestions.length === 0 && step !== "done") {
    return (
      <div className="mx-auto min-h-full max-w-lg px-5 py-16">
        <SourceWordmark />
        <h1 className="mt-10 font-[family-name:var(--font-space)] text-[28px] font-medium">This request is already answered.</h1>
        <p className="mt-3 text-[13px] text-[#101A15]/65">
          {data.requesterName} already has a response on this link. You can close this page.
        </p>
      </div>
    );
  }

  const terms = data?.disclosure?.terms;
  const canSubmit =
    Boolean(draft.action) &&
    (draft.action !== "unknown" || Boolean(draft.unknownRoute)) &&
    (!askingSupplier || Boolean(draft.upstreamName.trim())) &&
    (!assigningColleague || Boolean(draft.colleagueEmail.trim()));

  return (
    <div className="mx-auto min-h-full max-w-lg px-5 py-16">
      <SourceWordmark />
      {step === "land" ? (
        <>
          <h1 className="mt-10 font-[family-name:var(--font-space)] text-[28px] font-medium tracking-[-0.02em]">
            {data?.requesterName ?? "A manufacturer"} requests product evidence.
          </h1>
          <p className="mt-3 text-[13px] text-[#101A15]/65">
            {openQuestions.length} requirement{openQuestions.length === 1 ? "" : "s"}
            {data?.package?.products?.length ? ` · ${data.package.products.join(", ")}` : ""}
          </p>
          <p className="mt-6 text-[14.5px] leading-relaxed text-[#101A15]/70">
            Before you share anything, SOURCE explains why the evidence is needed, who will receive the result and how
            your source material will be used. You choose how the evidence may be disclosed.
          </p>
          <SourceButton className="mt-8" onClick={() => go(accepted ? "request" : "terms")}>
            Continue
          </SourceButton>
        </>
      ) : null}

      {step === "protocol" && data?.disclosure && terms ? (
        <>
          <SourceLabel className="mt-10">Data disclosure</SourceLabel>
          <h1 className="mt-2 font-[family-name:var(--font-space)] text-[24px] tracking-[-0.02em]">
            How this request will be used
          </h1>
          <p className="mt-3 text-[13px] text-[#101A15]/55">
            {terms.title} · {terms.version}
          </p>
          {terms.legalReviewStatus === "REQUIRES_LEGAL_REVIEW" ? (
            <p className="mt-4 border border-[#B26B2C]/40 bg-[#FBFCFA] px-3 py-2 text-[12px] leading-relaxed text-[#101A15]/75">
              These Data Disclosure Terms are draft product copy for a controlled SOURCE pilot. They
              require legal review before public production launch. Accepting them records operational
              consent for this request, not a formally approved legal agreement.
            </p>
          ) : null}
          <dl className="mt-6 space-y-4 text-[13px] leading-relaxed text-[#101A15]/75">
            <div>
              <dt className="font-medium text-[#101A15]">Why is this requested?</dt>
              <dd className="mt-1">{data.disclosure.why}</dd>
            </div>
            <div>
              <dt className="font-medium text-[#101A15]">Who is requesting it?</dt>
              <dd className="mt-1">
                {data.disclosure.who}
                {data.package?.products?.length ? ` · ${data.package.products.join(", ")}` : ""}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-[#101A15]">What is the scope?</dt>
              <dd className="mt-1">
                {(data.package?.requirementLabels ?? []).join(", ") || "The requirements listed on this request."}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-[#101A15]">How will SOURCE use it?</dt>
              <dd className="mt-1">
                <ul className="list-disc space-y-1 pl-4">
                  {data.disclosure.howUsed.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </dd>
            </div>
            <div>
              <dt className="font-medium text-[#101A15]">Who can see the original?</dt>
              <dd className="mt-1">{data.disclosure.originalVisibility}</dd>
            </div>
            <div>
              <dt className="font-medium text-[#101A15]">What may be shared as derived data?</dt>
              <dd className="mt-1">{data.disclosure.derivedData}</dd>
            </div>
            <div>
              <dt className="font-medium text-[#101A15]">Can SOURCE reuse it?</dt>
              <dd className="mt-1">{data.disclosure.reuse}</dd>
            </div>
            <div>
              <dt className="font-medium text-[#101A15]">Retention</dt>
              <dd className="mt-1">{data.disclosure.retention}</dd>
            </div>
          </dl>
          <button type="button" className="mt-4 text-[13px] text-[#0B6E50]" onClick={() => setShowFullTerms((v) => !v)}>
            {showFullTerms ? "Hide full terms" : "Read the complete Data Disclosure Terms"}
          </button>
          {showFullTerms ? (
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap border border-[#101A15]/10 bg-[#FBFCFA] p-3 text-[12px] leading-relaxed">
              {terms.fullText}
            </pre>
          ) : null}
          <label className="mt-4 flex items-start gap-2 text-[13px]">
            <input type="checkbox" checked={authorityConfirmed} onChange={(e) => setAuthorityConfirmed(e.target.checked)} />
            <span>I confirm that I am authorised to provide this information on behalf of my organisation.</span>
          </label>
          <label className="mt-3 flex items-start gap-2 text-[13px]">
            <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
            <span>I have read and accept the Data Disclosure Terms for this request.</span>
          </label>
          {message ? <p className="mt-3 text-[13px] text-[#B26B2C]">{message}</p> : null}
          <SourceButton className="mt-8" onClick={() => void acceptTerms()} disabled={!authorityConfirmed || !termsAccepted || busy}>
            Accept and continue
          </SourceButton>
        </>
      ) : null}

      {step === "list" ? (
        <>
          <SourceLabel className="mt-10">Request scope</SourceLabel>
          <h1 className="mt-2 font-[family-name:var(--font-space)] text-[24px] tracking-[-0.02em]">
            What {data?.requesterName ?? "the manufacturer"} still needs
          </h1>
          {questions.length ? (
            <p className="mt-2 text-[13px] text-[#101A15]/55">
              {answeredCount} of {questions.length}
            </p>
          ) : null}
          {pendingReuse.length ? (
            <div className="mt-6 space-y-4">
              {pendingReuse.map((row) => (
                <ReuseConsentCard
                  key={row.id}
                  row={row}
                  busy={busy}
                  onDecide={(decision) => void decideReuse(row, decision)}
                />
              ))}
            </div>
          ) : null}
          <ul className="mt-6 space-y-2">
            {openQuestions.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="w-full border border-[#101A15]/10 bg-[#FBFCFA] px-4 py-3 text-left"
                  onClick={() => go("requirement", item.id)}
                >
                  <div className="text-[14.5px]">{item.propertyLabel}</div>
                  <SourceLabel className="mt-1 block">{item.subjectLabel}</SourceLabel>
                  {pendingReuse.some((row) => row.caseId === item.id) ? (
                    <p className="mt-2 text-[12px] text-[#0B6E50]">We may already have the evidence needed.</p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {step === "act" && !current ? (
        <>
          <button type="button" className="mt-8 text-[13px] text-[#0B6E50]" onClick={() => go("request")}>
            ← Back to request
          </button>
          <p className="mt-6 text-[13px] text-[#101A15]/65">This requirement is not on this request.</p>
        </>
      ) : null}

      {step === "act" && current ? (
        <>
          <button type="button" className="mt-8 text-[13px] text-[#0B6E50]" onClick={() => go("request")}>
            ← Back to request
          </button>
          {questions.length ? (
            <p className="mt-3 text-[12px] text-[#101A15]/55">
              {progressIndex + 1} of {questions.length}
            </p>
          ) : null}
          <SourceLabel className="mt-4">{data?.requesterName}</SourceLabel>
          <h1 className="mt-2 font-[family-name:var(--font-space)] text-[24px]">{current.propertyLabel}</h1>
          <p className="mt-2 text-[13px] text-[#101A15]/65">{current.subjectLabel}</p>
          {current.productNames?.length ? (
            <p className="mt-2 text-[13px] text-[#101A15]/65">Product: {current.productNames.join(", ")}</p>
          ) : null}
          {current.whyRequested ? (
            <p className="mt-4 text-[14.5px] leading-relaxed text-[#101A15]/75">{current.whyRequested}</p>
          ) : null}
          {pendingReuse.filter((row) => row.caseId === current.id).map((row) => (
            <ReuseConsentCard
              key={row.id}
              row={row}
              busy={busy}
              onDecide={(decision) => void decideReuse(row, decision)}
            />
          ))}
          <div className="mt-6 grid gap-2">
            {SUPPLIER_ACTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => patch({ action: item.id, unknownRoute: item.id === "unknown" ? null : draft.unknownRoute })}
                className={`border px-3 py-2 text-left text-[13px] ${draft.action === item.id ? "border-[#0B6E50] bg-[#FBFCFA]" : "border-[#101A15]/10"}`}
              >
                {item.label}
                {"recommended" in item && item.recommended ? (
                  <span className="ml-2 text-[11px] uppercase tracking-wide text-[#0B6E50]">Recommended</span>
                ) : null}
              </button>
            ))}
          </div>
          {draft.action === "original" || draft.action === "alternative" || draft.action === "attest" ? (
            <EvidenceFields
              draft={draft}
              requesterName={data?.requesterName}
              openQuestions={openQuestions}
              currentId={current.id}
              uploadState={uploadState}
              onPatch={patch}
            />
          ) : null}
          {draft.action === "cannot" ? (
            <select
              className="mt-6 w-full border border-[#101A15]/15 px-3 py-2 text-[13px]"
              value={draft.cannotReason}
              onChange={(e) => patch({ cannotReason: e.target.value as CannotProvideReason })}
            >
              <option value="confidentiality">Confidentiality</option>
              <option value="commercially_sensitive">Commercially sensitive</option>
              <option value="unavailable">Evidence is unavailable</option>
              <option value="not_responsible">Not responsible for this information</option>
              <option value="unknown">Unknown</option>
              <option value="another_party">Another party owns the evidence</option>
              <option value="other">Other</option>
            </select>
          ) : null}
          {draft.action === "unknown" ? (
            <div className="mt-6 space-y-2">
              <p className="text-[13px] text-[#101A15]/70">
                This does not answer the requirement. Choose the next owner for this product only.
              </p>
              {([
                ["ask_supplier", "Ask my supplier"],
                ["assign_colleague", "Assign colleague"],
                ["cannot_determine", "I cannot determine this"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`block w-full border px-3 py-2 text-left text-[13px] ${draft.unknownRoute === id ? "border-[#0B6E50] bg-[#FBFCFA]" : "border-[#101A15]/10"}`}
                  onClick={() => patch({ unknownRoute: id as UnknownRoute })}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          {askingSupplier ? (
            <UpstreamFields
              draft={draft}
              suggested={suggestedContact}
              suggestedOrg={matchedUpstream?.name}
              onPatch={patch}
            />
          ) : null}
          {assigningColleague || draft.action === "wrong" ? (
            <ColleagueFields
              draft={draft}
              ownContacts={data?.ownContacts}
              wrongPerson={draft.action === "wrong"}
              onPatch={patch}
            />
          ) : null}
          {message && step === "act" ? <p className="mt-3 text-[13px] text-[#B26B2C]">{message}</p> : null}
          <SourceButton className="mt-8" onClick={() => void run()} disabled={!canSubmit || busy}>
            Submit
          </SourceButton>
        </>
      ) : null}

      {step === "done" ? (
        <>
          <h1 className="mt-10 font-[family-name:var(--font-space)] text-[24px]">Received.</h1>
          <EvidenceLine className="mt-4" />
          <p className="mt-4 text-[14.5px] leading-relaxed text-[#101A15]/75">{message}</p>
          {confirmation ? <p className="mt-2 text-[13px] text-[#101A15]/65">{confirmation}</p> : null}
          <StatusPill tone="signal">Same request · SOURCE continues if more is needed</StatusPill>
          <SourceButton className="mt-8" onClick={() => go("request")}>
            ← Back to request
          </SourceButton>
        </>
      ) : null}
    </div>
  );
}

function EvidenceFields(props: {
  draft: ReturnType<typeof draftForCase>;
  requesterName?: string;
  openQuestions: PortalView["questions"];
  currentId: string;
  uploadState: string | null;
  onPatch: (patch: Partial<ReturnType<typeof draftForCase>>) => void;
}) {
  const { draft, onPatch } = props;
  return (
    <div className="mt-6 space-y-3">
      {draft.action !== "attest" ? (
        <label className="block text-[12px]">
          Relevant value or claim, if known
          <input className="mt-1 w-full border border-[#101A15]/15 px-3 py-2" value={draft.value} onChange={(e) => onPatch({ value: e.target.value })} />
        </label>
      ) : (
        <>
          <input className="w-full border border-[#101A15]/15 px-3 py-2 text-[13px]" placeholder="Legal entity" value={draft.attestation.legalEntity} onChange={(e) => onPatch({ attestation: { ...draft.attestation, legalEntity: e.target.value } })} />
          <input className="w-full border border-[#101A15]/15 px-3 py-2 text-[13px]" placeholder="Your name" value={draft.attestation.personName} onChange={(e) => onPatch({ attestation: { ...draft.attestation, personName: e.target.value } })} />
          <input className="w-full border border-[#101A15]/15 px-3 py-2 text-[13px]" placeholder="Role / function" value={draft.attestation.role} onChange={(e) => onPatch({ attestation: { ...draft.attestation, role: e.target.value } })} />
          <textarea className="w-full border border-[#101A15]/15 px-3 py-2 text-[13px]" placeholder="Exact statement" rows={4} value={draft.attestation.statement} onChange={(e) => onPatch({ attestation: { ...draft.attestation, statement: e.target.value } })} />
        </>
      )}
      {draft.action === "original" || draft.action === "alternative" ? (
        <label className="block text-[12px]">
          {draft.action === "original" ? "Upload original supporting evidence" : "Upload alternative evidence"}
          <input
            className="mt-1 block w-full"
            type="file"
            accept=".pdf,.csv,.png,.jpg,.jpeg,application/pdf,text/csv,image/png,image/jpeg"
            onChange={(event) => onPatch({ evidenceFile: event.target.files?.[0] ?? null })}
          />
          <span className="mt-1 block text-[12px] text-[#101A15]/55">
            SOURCE stores the original privately and assesses whether it is sufficient. Uploading does not make the file public.
          </span>
          {props.uploadState ? <span className="mt-1 block">{props.uploadState}</span> : null}
        </label>
      ) : null}
      <fieldset className="space-y-2">
        <legend className="text-[12px]">How may this evidence be disclosed?</legend>
        {SUPPLIER_DISCLOSURE_MODES.map((item) => (
          <label key={item.id} className="block border border-[#101A15]/10 px-3 py-2 text-[12px]">
            <input type="radio" className="mr-2" checked={draft.disclosureMode === item.id} onChange={() => onPatch({ disclosureMode: item.id as DisclosureMode })} />
            {item.label}
            <span className="mt-1 block text-[#101A15]/55">{item.help}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-[12px]">Can SOURCE reuse this evidence if it appears relevant later?</legend>
        {SUPPLIER_REUSE_CHOICES.map((item) => (
          <label key={item.id} className="block border border-[#101A15]/10 px-3 py-2 text-[12px]">
            <input type="radio" className="mr-2" checked={draft.reusePolicy === item.id} onChange={() => onPatch({ reusePolicy: item.id as EvidenceReusePolicy })} />
            {item.label}
            <span className="mt-1 block text-[#101A15]/55">
              {item.id === "REUSE_WITHIN_REQUESTING_ORGANISATION"
                ? `SOURCE may reuse this evidence for compatible requests from ${props.requesterName ?? "this organisation"} without asking again.`
                : item.help}
            </span>
          </label>
        ))}
      </fieldset>
      {props.openQuestions.length > 1 ? (
        <fieldset className="space-y-1">
          <legend className="text-[12px]">This evidence also supports (explicit choice)</legend>
          {props.openQuestions
            .filter((item) => item.id !== props.currentId)
            .map((item) => (
              <label key={item.id} className="block text-[12px]">
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={draft.supportIds.includes(item.id)}
                  onChange={(event) =>
                    onPatch({
                      supportIds: event.target.checked
                        ? [...draft.supportIds, item.id]
                        : draft.supportIds.filter((id) => id !== item.id),
                    })
                  }
                />
                {item.propertyLabel} · {item.subjectLabel}
              </label>
            ))}
        </fieldset>
      ) : null}
    </div>
  );
}

function UpstreamFields(props: {
  draft: ReturnType<typeof draftForCase>;
  suggested?: { name: string; email: string };
  suggestedOrg?: string;
  onPatch: (patch: Partial<ReturnType<typeof draftForCase>>) => void;
}) {
  const { draft, onPatch } = props;
  return (
    <div className="mt-6 space-y-3">
      <p className="text-[13px] text-[#101A15]/70">
        SOURCE will send a scoped request only if a contact email is provided. Organisation name alone is not enough.
      </p>
      <label className="block text-[12px]">
        Supplier organisation
        <input className="mt-1 w-full border border-[#101A15]/15 px-3 py-2 text-[13px]" value={draft.upstreamName} onChange={(e) => onPatch({ upstreamName: e.target.value })} />
      </label>
      <label className="block text-[12px]">
        Contact email
        <input className="mt-1 w-full border border-[#101A15]/15 px-3 py-2 text-[13px]" type="email" value={draft.upstreamEmail} onChange={(e) => onPatch({ upstreamEmail: e.target.value })} />
      </label>
      <label className="block text-[12px]">
        Contact name (optional)
        <input className="mt-1 w-full border border-[#101A15]/15 px-3 py-2 text-[13px]" value={draft.upstreamContactName} onChange={(e) => onPatch({ upstreamContactName: e.target.value })} />
      </label>
      {props.suggested ? (
        <p className="text-[12px] text-[#101A15]/70">
          SOURCE already has {props.suggested.email}
          {props.suggestedOrg ? ` for ${props.suggestedOrg}` : ""}. Confirm this contact before SOURCE queues a request.
          <button type="button" className="ml-2 text-[#0B6E50]" onClick={() => onPatch({ upstreamEmail: props.suggested!.email, upstreamContactName: props.suggested!.name })}>
            Use this contact
          </button>
        </p>
      ) : null}
      {!draft.upstreamEmail.trim() && draft.upstreamName.trim() ? (
        <p className="text-[12px] text-[#B26B2C]">Contact details required — request not sent.</p>
      ) : null}
      <select className="w-full border border-[#101A15]/15 px-3 py-2 text-[13px]" value={draft.upstreamMode} onChange={(e) => onPatch({ upstreamMode: e.target.value as UpstreamContactMode })}>
        <option value="confidential">Keep my supplier identity protected</option>
        <option value="on_behalf">Contact them on behalf of my customer</option>
        <option value="without_customer">Contact them without naming the customer</option>
      </select>
    </div>
  );
}

function ColleagueFields(props: {
  draft: ReturnType<typeof draftForCase>;
  ownContacts?: { name: string; email: string }[];
  wrongPerson: boolean;
  onPatch: (patch: Partial<ReturnType<typeof draftForCase>>) => void;
}) {
  const { draft, onPatch } = props;
  return (
    <div className="mt-6 space-y-3">
      <p className="text-[13px] text-[#101A15]/70">
        SOURCE will send this person a scoped request for this requirement only. This does not mark the requirement ready.
      </p>
      <label className="block text-[12px]">
        Work email
        <input className="mt-1 w-full border border-[#101A15]/15 px-3 py-2 text-[13px]" type="email" required value={draft.colleagueEmail} onChange={(e) => onPatch({ colleagueEmail: e.target.value })} />
      </label>
      <label className="block text-[12px]">
        Name (optional)
        <input className="mt-1 w-full border border-[#101A15]/15 px-3 py-2 text-[13px]" value={draft.colleagueName} onChange={(e) => onPatch({ colleagueName: e.target.value })} />
      </label>
      {props.ownContacts?.[0] ? (
        <p className="text-[12px] text-[#101A15]/70">
          SOURCE already has {props.ownContacts[0].email}. Confirm before dispatch.
          <button type="button" className="ml-2 text-[#0B6E50]" onClick={() => onPatch({ colleagueEmail: props.ownContacts![0].email, colleagueName: props.ownContacts![0].name })}>
            Use this contact
          </button>
        </p>
      ) : null}
    </div>
  );
}

function ReuseConsentCard(props: {
  row: NonNullable<PortalView["reuseRequests"]>[number];
  busy: boolean;
  onDecide: (decision: "APPROVED" | "DECLINED") => void;
}) {
  const { row, busy, onDecide } = props;
  return (
    <section className="mt-6 border border-[#101A15]/10 bg-[#FBFCFA] p-4">
      <SourceLabel>We may already have the evidence needed</SourceLabel>
      <p className="mt-3 text-[14.5px] leading-relaxed">
        You previously shared <span className="font-medium">{row.evidenceLabel ?? "this evidence"}</span>
        {row.originalUse ? `. Originally used for ${row.originalUse}` : "."}
      </p>
      <p className="mt-3 text-[13px] text-[#101A15]/75">
        SOURCE believes this evidence may also support{" "}
        {(row.proposedProducts && row.proposedProducts.length > 0 ? row.proposedProducts : [row.proposedUse])
          .filter(Boolean)
          .join(", ") || "this request"}
        .
      </p>
      <dl className="mt-4 space-y-2 text-[12px] text-[#101A15]/70">
        <div>
          <dt className="font-medium text-[#101A15]">Requested by</dt>
          <dd>{row.requesterName}</dd>
        </div>
        <div>
          <dt className="font-medium text-[#101A15]">Purpose</dt>
          <dd>{row.purposeLabel ?? row.purpose ?? "This information request"}</dd>
        </div>
        {row.disclosureLabel ? (
          <div>
            <dt className="font-medium text-[#101A15]">Original evidence disclosure</dt>
            <dd>{row.disclosureLabel}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-3 text-[12px] text-[#101A15]/55">No new upload is required if you approve reuse.</p>
      <div className="mt-4 flex flex-col gap-2">
        <SourceButton onClick={() => onDecide("APPROVED")} disabled={busy}>
          Allow reuse for this request
        </SourceButton>
        <SourceButton variant="ghost" onClick={() => onDecide("DECLINED")} disabled={busy}>
          Do not reuse — I&apos;ll provide evidence separately
        </SourceButton>
      </div>
    </section>
  );
}
