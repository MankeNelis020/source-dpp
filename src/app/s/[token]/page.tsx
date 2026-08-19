"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { SourceWordmark } from "@/components/source/wordmark";
import { EvidenceLine, SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";
import { SUPPLIER_ACTIONS, SUPPLIER_DISCLOSURE_MODES } from "@/domain/source/copy";
import { uploadSourceFile, usePortalCommand, useSourceQuery } from "@/client/source/api";
import type {
  CannotProvideReason,
  DisclosureMode,
  EvidenceReusePolicy,
  EvidenceRoute,
  UnknownChoice,
  UpstreamContactMode,
} from "@/domain/source";

type ActionId = (typeof SUPPLIER_ACTIONS)[number]["id"];

interface PortalView {
  requesterName: string;
  actorId: string;
  actorName?: string;
  allowedCommands: string[];
  package?: { products: string[]; requirementLabels: string[] };
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
  }[];
}

const ROUTE_BY_ACTION: Partial<Record<ActionId, EvidenceRoute>> = {
  original: "ORIGINAL_DOCUMENT",
  alternative: "ALTERNATIVE_DOCUMENT",
  attest: "SUPPLIER_ATTESTATION",
  cannot: "CANNOT_PROVIDE",
};

export default function SupplierPortalPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const { data, error, errorCode, reload } = useSourceQuery<PortalView>(token ? `/api/portal/${encodeURIComponent(token)}` : null);
  const runCommand = usePortalCommand(token);
  const questions = useMemo(() => data?.questions ?? [], [data?.questions]);
  const openQuestions = useMemo(() => questions.filter((q) => !q.submitted && q.state !== "READY"), [questions]);
  const accepted = Boolean(data?.acceptance?.authorityConfirmed && data?.acceptance?.termsAccepted);

  const [step, setStep] = useState<"land" | "protocol" | "list" | "act" | "done">("land");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [action, setAction] = useState<ActionId | null>(null);
  const [value, setValue] = useState("");
  const [unknown, setUnknown] = useState<UnknownChoice>("ask_supplier");
  const [upstreamMode, setUpstreamMode] = useState<UpstreamContactMode>("confidential");
  const [upstreamName, setUpstreamName] = useState("");
  const [colleague, setColleague] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<string | null>(null);
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showFullTerms, setShowFullTerms] = useState(false);
  const [reusePolicy, setReusePolicy] = useState<EvidenceReusePolicy>("NO_REUSE");
  const [disclosureMode, setDisclosureMode] = useState<DisclosureMode>("PROTECTED_SOURCE");
  const [cannotReason, setCannotReason] = useState<CannotProvideReason>("commercially_sensitive");
  const [attestation, setAttestation] = useState({
    legalEntity: "",
    personName: "",
    role: "",
    statement: "",
  });
  const [supportIds, setSupportIds] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const current = useMemo(
    () => openQuestions.find((c) => c.id === caseId) ?? openQuestions[0],
    [openQuestions, caseId]
  );

  function finish(text: string, extra?: string) {
    setMessage(text);
    setConfirmation(extra ?? null);
    setStep("done");
    void reload();
  }

  async function acceptTerms() {
    if (!current || busy || !token || !data?.disclosure) return;
    setBusy(true);
    try {
      await runCommand({
        type: "ACCEPT_EVIDENCE_DISCLOSURE",
        caseId: current.id,
        authorityConfirmed,
        termsAccepted,
        agreementId: data.disclosure.terms.agreementId,
        agreementVersion: data.disclosure.terms.version,
        reusePolicy,
      });
      setStep("list");
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "The terms could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!current || busy || !token) return;
    setBusy(true);
    try {
      const route = action ? ROUTE_BY_ACTION[action] : undefined;
      if (route === "ORIGINAL_DOCUMENT" || route === "ALTERNATIVE_DOCUMENT" || route === "SUPPLIER_ATTESTATION" || route === "CANNOT_PROVIDE") {
        let storageObjectId: string | undefined;
        if (route === "ORIGINAL_DOCUMENT" || route === "ALTERNATIVE_DOCUMENT") {
          if (!evidenceFile) {
            setBusy(false);
            setMessage("Choose a supporting file first.");
            return;
          }
          setUploadState("Uploading…");
          const stored = await uploadSourceFile({
            purpose: "EVIDENCE",
            file: evidenceFile,
            caseId: current.id,
            portalToken: token,
          });
          storageObjectId = stored.id;
          setUploadState("File received.");
        }
        await runCommand({
          type: "SUBMIT_RESPONSE",
          caseId: current.id,
          value: route === "SUPPLIER_ATTESTATION" ? attestation.statement : value,
          unit: "%",
          evidence:
            route === "ORIGINAL_DOCUMENT" || route === "ALTERNATIVE_DOCUMENT"
              ? { filename: evidenceFile?.name ?? "upload", storageObjectId }
              : undefined,
          permission: "GRANTED",
          evidenceRoute: route,
          disclosureMode: route === "CANNOT_PROVIDE" ? "CANNOT_DISCLOSE" : disclosureMode,
          reusePolicy,
          supportsCaseIds: supportIds.filter((id) => id !== current.id),
          cannotProvideReason: route === "CANNOT_PROVIDE" ? cannotReason : undefined,
          attestation:
            route === "SUPPLIER_ATTESTATION"
              ? {
                  legalEntity: attestation.legalEntity,
                  personName: attestation.personName,
                  role: attestation.role,
                  statement: attestation.statement,
                  productIds: current.productNames ?? [],
                  requirementIds: [current.propertyLabel ?? current.id],
                }
              : undefined,
        });
        const modeLabel =
          route === "CANNOT_PROVIDE"
            ? "cannot disclose"
            : SUPPLIER_DISCLOSURE_MODES.find((item) => item.id === disclosureMode)?.label ?? disclosureMode;
        finish(
          route === "CANNOT_PROVIDE"
            ? "Recorded. This does not resolve the requirement. SOURCE will keep the gap open."
            : route === "SUPPLIER_ATTESTATION"
              ? "Declaration received. SOURCE will assess whether it is sufficient. A declaration is not automatically proof."
              : "Evidence received. SOURCE will assess whether it supports the listed requirements.",
          `${route.replaceAll("_", " ").toLowerCase()} · ${modeLabel}. The original file is not made public by uploading it.`
        );
        return;
      }
      if (action === "unknown") {
        await runCommand({ type: "MARK_UNKNOWN", caseId: current.id, choice: unknown });
        finish("Recorded. SOURCE will continue with the next owner of this answer.");
        return;
      }
      if (action === "upstream") {
        if (!upstreamName.trim()) {
          setBusy(false);
          setMessage("Name the upstream organisation first.");
          return;
        }
        await runCommand({ type: "MARK_UNKNOWN", caseId: current.id, choice: "ask_supplier" });
        await runCommand({
          type: "FORWARD_UPSTREAM",
          caseId: current.id,
          upstream: { name: upstreamName.trim(), legalName: upstreamName.trim(), country: "Unknown" },
          mode: upstreamMode,
        });
        finish(
          upstreamMode === "confidential"
            ? "Your customer will not see this upstream identity. The original request stays the same."
            : "SOURCE will ask your supplier. This continues the same request."
        );
        return;
      }
      if (action === "colleague") {
        if (!colleague.trim()) {
          setBusy(false);
          setMessage("Enter a colleague email first.");
          return;
        }
        await runCommand({
          type: "ASSIGN_COLLEAGUE",
          caseId: current.id,
          contact: { actorId: data?.actorId ?? "", role: "compliance", name: "Colleague", email: colleague.trim() },
        });
        finish("The same scoped request was forwarded. You remain in the history.");
        return;
      }
      if (action === "wrong") {
        if (!colleague.trim()) {
          setBusy(false);
          setMessage("Enter a better contact email first.");
          return;
        }
        await runCommand({
          type: "MARK_WRONG_CONTACT",
          caseId: current.id,
          mode: "provide_contact",
          contact: { role: "compliance", name: "Colleague", email: colleague.trim() },
        });
        finish("Thank you. SOURCE will send the same request to the new person.");
      }
    } catch (err) {
      finish(err instanceof Error ? err.message : "The request could not be completed.");
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
          <SourceButton className="mt-8" onClick={() => setStep(accepted ? "list" : "protocol")}>
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
          ) : (
            <div className="mt-3 space-y-3">
              {terms.sections.map((section) => (
                <div key={section.heading}>
                  <div className="text-[12px] font-medium">{section.heading}</div>
                  <p className="mt-1 text-[12px] text-[#101A15]/70">{section.body}</p>
                </div>
              ))}
            </div>
          )}
          <label className="mt-6 block text-[12px]">
            Reuse for this request
            <select
              className="mt-1 w-full border border-[#101A15]/15 px-3 py-2"
              value={reusePolicy}
              onChange={(e) => setReusePolicy(e.target.value as EvidenceReusePolicy)}
            >
              <option value="NO_REUSE">Do not reuse this evidence for other requests</option>
              <option value="REUSE_WITHIN_REQUESTING_ORGANISATION">Allow reuse only within this organisation</option>
              <option value="BROADER_REUSE">Permit broader reuse if SOURCE later asks (never silent, never automatic)</option>
            </select>
          </label>
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
          <ul className="mt-6 space-y-2">
            {openQuestions.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="w-full border border-[#101A15]/10 bg-[#FBFCFA] px-4 py-3 text-left"
                  onClick={() => {
                    setCaseId(item.id);
                    setSupportIds([]);
                    setStep("act");
                  }}
                >
                  <div className="text-[14.5px]">{item.propertyLabel}</div>
                  <SourceLabel className="mt-1 block">{item.subjectLabel}</SourceLabel>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {step === "act" && current ? (
        <>
          <SourceLabel className="mt-10">{data?.requesterName}</SourceLabel>
          <h1 className="mt-2 font-[family-name:var(--font-space)] text-[24px]">{current.propertyLabel}</h1>
          <p className="mt-2 text-[13px] text-[#101A15]/65">{current.subjectLabel}</p>
          {current.productNames?.length ? (
            <p className="mt-2 text-[13px] text-[#101A15]/65">Product: {current.productNames.join(", ")}</p>
          ) : null}
          {current.whyRequested ? (
            <p className="mt-4 text-[14.5px] leading-relaxed text-[#101A15]/75">{current.whyRequested}</p>
          ) : null}
          <div className="mt-6 grid gap-2">
            {SUPPLIER_ACTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setAction(item.id)}
                className={`border px-3 py-2 text-left text-[13px] ${action === item.id ? "border-[#0B6E50] bg-[#FBFCFA]" : "border-[#101A15]/10"}`}
              >
                {item.label}
                {"recommended" in item && item.recommended ? (
                  <span className="ml-2 text-[11px] uppercase tracking-wide text-[#0B6E50]">Recommended</span>
                ) : null}
              </button>
            ))}
          </div>
          {action === "original" || action === "alternative" || action === "attest" ? (
            <div className="mt-6 space-y-3">
              {action !== "attest" ? (
                <label className="block text-[12px]">
                  Relevant value or claim, if known
                  <input className="mt-1 w-full border border-[#101A15]/15 px-3 py-2" value={value} onChange={(e) => setValue(e.target.value)} />
                </label>
              ) : (
                <>
                  <input
                    className="w-full border border-[#101A15]/15 px-3 py-2 text-[13px]"
                    placeholder="Legal entity"
                    value={attestation.legalEntity}
                    onChange={(e) => setAttestation((row) => ({ ...row, legalEntity: e.target.value }))}
                  />
                  <input
                    className="w-full border border-[#101A15]/15 px-3 py-2 text-[13px]"
                    placeholder="Your name"
                    value={attestation.personName}
                    onChange={(e) => setAttestation((row) => ({ ...row, personName: e.target.value }))}
                  />
                  <input
                    className="w-full border border-[#101A15]/15 px-3 py-2 text-[13px]"
                    placeholder="Role / function"
                    value={attestation.role}
                    onChange={(e) => setAttestation((row) => ({ ...row, role: e.target.value }))}
                  />
                  <textarea
                    className="w-full border border-[#101A15]/15 px-3 py-2 text-[13px]"
                    placeholder="Exact statement"
                    rows={4}
                    value={attestation.statement}
                    onChange={(e) => setAttestation((row) => ({ ...row, statement: e.target.value }))}
                  />
                </>
              )}
              {action === "original" || action === "alternative" ? (
                <label className="block text-[12px]">
                  {action === "original" ? "Upload original supporting evidence" : "Upload alternative evidence"}
                  <input
                    className="mt-1 block w-full"
                    type="file"
                    accept=".pdf,.csv,.png,.jpg,.jpeg,application/pdf,text/csv,image/png,image/jpeg"
                    onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
                  />
                  <span className="mt-1 block text-[12px] text-[#101A15]/55">
                    SOURCE stores the original privately and assesses whether it is sufficient. Uploading does not make the file public.
                  </span>
                  {uploadState ? <span className="mt-1 block">{uploadState}</span> : null}
                </label>
              ) : null}
              <fieldset className="space-y-2">
                <legend className="text-[12px]">How may this evidence be disclosed?</legend>
                {SUPPLIER_DISCLOSURE_MODES.map((item) => (
                  <label key={item.id} className="block border border-[#101A15]/10 px-3 py-2 text-[12px]">
                    <input
                      type="radio"
                      className="mr-2"
                      checked={disclosureMode === item.id}
                      onChange={() => setDisclosureMode(item.id)}
                    />
                    {item.label}
                    <span className="mt-1 block text-[#101A15]/55">{item.help}</span>
                  </label>
                ))}
              </fieldset>
              {openQuestions.length > 1 ? (
                <fieldset className="space-y-1">
                  <legend className="text-[12px]">This evidence also supports</legend>
                  {openQuestions
                    .filter((item) => item.id !== current.id)
                    .map((item) => (
                      <label key={item.id} className="block text-[12px]">
                        <input
                          type="checkbox"
                          className="mr-2"
                          checked={supportIds.includes(item.id)}
                          onChange={(event) =>
                            setSupportIds((ids) =>
                              event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id)
                            )
                          }
                        />
                        {item.propertyLabel} · {item.subjectLabel}
                      </label>
                    ))}
                </fieldset>
              ) : null}
            </div>
          ) : null}
          {action === "cannot" ? (
            <select
              className="mt-6 w-full border border-[#101A15]/15 px-3 py-2 text-[13px]"
              value={cannotReason}
              onChange={(e) => setCannotReason(e.target.value as CannotProvideReason)}
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
          {action === "unknown" ? (
            <select className="mt-6 w-full border border-[#101A15]/15 px-3 py-2 text-[13px]" value={unknown} onChange={(e) => setUnknown(e.target.value as UnknownChoice)}>
              <option value="ask_supplier">Ask my supplier</option>
              <option value="assign_colleague">Assign a colleague</option>
              <option value="do_not_have">We do not have this</option>
              <option value="does_not_exist">This does not exist</option>
            </select>
          ) : null}
          {action === "upstream" ? (
            <div className="mt-6 space-y-3">
              <input
                className="w-full border border-[#101A15]/15 px-3 py-2 text-[13px]"
                placeholder="Upstream organisation name"
                value={upstreamName}
                onChange={(e) => setUpstreamName(e.target.value)}
              />
              <select className="w-full border border-[#101A15]/15 px-3 py-2 text-[13px]" value={upstreamMode} onChange={(e) => setUpstreamMode(e.target.value as UpstreamContactMode)}>
                <option value="confidential">Keep my supplier identity protected</option>
                <option value="on_behalf">Contact them on behalf of my customer</option>
                <option value="without_customer">Contact them without naming the customer</option>
              </select>
            </div>
          ) : null}
          {action === "colleague" || action === "wrong" ? (
            <input
              className="mt-6 w-full border border-[#101A15]/15 px-3 py-2 text-[13px]"
              placeholder="colleague@example.com"
              value={colleague}
              onChange={(e) => setColleague(e.target.value)}
            />
          ) : null}
          {message && step === "act" ? <p className="mt-3 text-[13px] text-[#B26B2C]">{message}</p> : null}
          <SourceButton className="mt-8" onClick={() => void run()} disabled={!action || busy}>
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
          {openQuestions.length > 0 ? (
            <SourceButton className="mt-8" onClick={() => setStep("list")}>
              Back to request
            </SourceButton>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
