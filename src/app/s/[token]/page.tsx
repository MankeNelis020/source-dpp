"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { SourceWordmark } from "@/components/source/wordmark";
import { EvidenceLine, SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";
import { SUPPLIER_ACTIONS } from "@/domain/source/copy";
import { usePortalCommand, useSourceQuery } from "@/client/source/api";
import type { DeclineReason, UnknownChoice, UpstreamContactMode } from "@/domain/source";

type ActionId = (typeof SUPPLIER_ACTIONS)[number]["id"];

interface PortalView {
  requesterName: string;
  allowedCommands: string[];
  questions: { id: string; version: number; state: string; propertyLabel?: string; subjectLabel?: string; nextAction: string }[];
}

export default function SupplierPortalPage() {
  const params = useParams<{ token: string }>();
  const token = params.token || "demo";
  const { data, error, reload } = useSourceQuery<PortalView>(`/api/portal/${encodeURIComponent(token)}`);
  const runCommand = usePortalCommand(token);
  const questions = useMemo(() => data?.questions ?? [], [data?.questions]);

  const [step, setStep] = useState<"land" | "list" | "act" | "done">("land");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [action, setAction] = useState<ActionId | null>(null);
  const [value, setValue] = useState("67");
  const [share, setShare] = useState<"GRANTED" | "REQUEST_REQUIRED" | "DENIED">("GRANTED");
  const [unknown, setUnknown] = useState<UnknownChoice>("ask_supplier");
  const [upstreamMode, setUpstreamMode] = useState<UpstreamContactMode>("confidential");
  const [upstreamName, setUpstreamName] = useState("Nordic Fibre Mill");
  const [declineReason, setDeclineReason] = useState<DeclineReason>("commercially_confidential");
  const [colleague, setColleague] = useState("compliance@suppliera.example");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = useMemo(
    () => questions.find((c) => c.id === caseId) ?? questions[0],
    [questions, caseId]
  );

  function finish(text: string) {
    setMessage(text);
    setStep("done");
    void reload();
  }

  async function run() {
    if (!current || busy) return;
    setBusy(true);
    try {
      if (action === "provide" || action === "upload" || action === "existing") {
        await runCommand({
          type: "SUBMIT_RESPONSE",
          caseId: current.id,
          value,
          unit: "%",
          evidence: action === "provide" ? undefined : { filename: "supplier-upload.pdf" },
          permission: share,
        });
        finish(
          action === "provide"
            ? "Answer saved as declared. If this dataset needs evidence, the case stays open."
            : "Evidence received. SOURCE will validate scope before the claim can become ready."
        );
        return;
      }
      if (action === "unknown") {
        await runCommand({ type: "MARK_UNKNOWN", caseId: current.id, choice: unknown });
        finish("I don't know is a primary SOURCE flow. The case continues with a next owner.");
        return;
      }
      if (action === "upstream") {
        await runCommand({ type: "MARK_UNKNOWN", caseId: current.id, choice: "ask_supplier" });
        await runCommand({
          type: "FORWARD_UPSTREAM",
          caseId: current.id,
          upstream: { name: upstreamName, legalName: upstreamName, country: "Finland" },
          mode: upstreamMode,
        });
        finish(
          upstreamMode === "confidential"
            ? "Your customer will not see this upstream identity. The original requirement stays the same."
            : "SOURCE will ask your supplier. This is a new attempt, not a new requirement."
        );
        return;
      }
      if (action === "colleague") {
        await runCommand({
          type: "ASSIGN_COLLEAGUE",
          caseId: current.id,
          contact: { actorId: "supplier-a", role: "compliance", name: "Colleague", email: colleague },
        });
        finish("The same scoped request was forwarded. You remain in the audit history.");
        return;
      }
      if (action === "decline") {
        await runCommand({ type: "DECLINE", caseId: current.id, reason: declineReason });
        finish("Refusal is recorded with a reason. SOURCE decides the next route — this is not a dead end.");
        return;
      }
      if (action === "wrong") {
        await runCommand({
          type: "MARK_WRONG_CONTACT",
          caseId: current.id,
          mode: "provide_contact",
          contact: { role: "compliance", name: "Colleague", email: colleague },
        });
        finish("Thank you. SOURCE will send the same request to the new person. No new case was created.");
      }
    } catch (err) {
      finish(err instanceof Error ? err.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto min-h-full max-w-lg px-5 py-16">
        <SourceWordmark />
        <h1 className="mt-10 font-[family-name:var(--font-space)] text-[28px] font-medium">This link is unavailable.</h1>
        <p className="mt-3 text-[13px] text-[#101A15]/65">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-full max-w-lg px-5 py-16">
      <SourceWordmark />
      {step === "land" ? (
        <>
          <h1 className="mt-10 font-[family-name:var(--font-space)] text-[28px] font-medium tracking-[-0.02em]">
            {data?.requesterName ?? "A manufacturer"} requests product information.
          </h1>
          <p className="mt-3 text-[13px] text-[#101A15]/65">
            {questions.length} open questions · You decide what may be reused
          </p>
          <p className="mt-6 text-[14.5px] leading-relaxed text-[#101A15]/70">
            If you do not know, cannot share, or are not the right person — that is still a valid answer.
          </p>
          <SourceButton className="mt-8" onClick={() => setStep("list")}>
            Start
          </SourceButton>
        </>
      ) : null}

      {step === "list" ? (
        <>
          <SourceLabel className="mt-10">Questions</SourceLabel>
          <h1 className="mt-2 font-[family-name:var(--font-space)] text-[24px] tracking-[-0.02em]">
            What SOURCE still needs
          </h1>
          <ul className="mt-6 space-y-2">
            {questions.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="w-full border border-[#101A15]/10 bg-[#FBFCFA] px-4 py-3 text-left"
                  onClick={() => {
                    setCaseId(item.id);
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
          <SourceLabel className="mt-10">{current.id}</SourceLabel>
          <h1 className="mt-2 font-[family-name:var(--font-space)] text-[24px]">{current.propertyLabel}</h1>
          <p className="mt-2 text-[13px] text-[#101A15]/65">{current.subjectLabel}</p>
          <div className="mt-6 grid gap-2">
            {SUPPLIER_ACTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setAction(item.id)}
                className={`border px-3 py-2 text-left text-[13px] ${action === item.id ? "border-[#0B6E50] bg-[#FBFCFA]" : "border-[#101A15]/10"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {action === "provide" || action === "upload" || action === "existing" ? (
            <div className="mt-6 space-y-3">
              <label className="block text-[12px]">
                Value
                <input className="mt-1 w-full border border-[#101A15]/15 px-3 py-2" value={value} onChange={(e) => setValue(e.target.value)} />
              </label>
              <label className="block text-[12px]">
                Permission
                <select className="mt-1 w-full border border-[#101A15]/15 px-3 py-2" value={share} onChange={(e) => setShare(e.target.value as typeof share)}>
                  <option value="GRANTED">Allow this customer to use the value</option>
                  <option value="REQUEST_REQUIRED">Ask me before reuse</option>
                  <option value="DENIED">Do not allow reuse</option>
                </select>
              </label>
            </div>
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
              <input className="w-full border border-[#101A15]/15 px-3 py-2 text-[13px]" value={upstreamName} onChange={(e) => setUpstreamName(e.target.value)} />
              <select className="w-full border border-[#101A15]/15 px-3 py-2 text-[13px]" value={upstreamMode} onChange={(e) => setUpstreamMode(e.target.value as UpstreamContactMode)}>
                <option value="confidential">Keep my supplier identity protected</option>
                <option value="on_behalf">Contact them on behalf of my customer</option>
                <option value="without_customer">Contact them without naming the customer</option>
              </select>
            </div>
          ) : null}
          {action === "decline" ? (
            <select className="mt-6 w-full border border-[#101A15]/15 px-3 py-2 text-[13px]" value={declineReason} onChange={(e) => setDeclineReason(e.target.value as DeclineReason)}>
              <option value="commercially_confidential">Commercially confidential</option>
              <option value="contract_restriction">Contract restriction</option>
              <option value="no_permission">No permission</option>
              <option value="legal_restriction">Legal restriction</option>
              <option value="information_unavailable">Information unavailable</option>
            </select>
          ) : null}
          {action === "colleague" || action === "wrong" ? (
            <input className="mt-6 w-full border border-[#101A15]/15 px-3 py-2 text-[13px]" value={colleague} onChange={(e) => setColleague(e.target.value)} />
          ) : null}
          <SourceButton className="mt-8" onClick={() => void run()} disabled={!action || busy}>
            Continue
          </SourceButton>
        </>
      ) : null}

      {step === "done" ? (
        <>
          <h1 className="mt-10 font-[family-name:var(--font-space)] text-[24px]">Received.</h1>
          <EvidenceLine className="mt-4" />
          <p className="mt-4 text-[14.5px] leading-relaxed text-[#101A15]/75">{message}</p>
          <StatusPill tone="signal">Same requirement · new attempt if needed</StatusPill>
          <SourceButton className="mt-8" onClick={() => setStep("list")}>
            Back to questions
          </SourceButton>
        </>
      ) : null}
    </div>
  );
}
