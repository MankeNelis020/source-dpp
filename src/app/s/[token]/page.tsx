"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { SourceWordmark } from "@/components/source/wordmark";
import { EvidenceLine, SourceButton, SourceLabel, StatusPill } from "@/components/source/ui";
import { SUPPLIER_ACTIONS } from "@/domain/source/copy";
import { caseByPortalToken } from "@/domain/source/queries";
import { dispatchCommand, useEngineState } from "@/domain/source/store";
import type { DeclineReason, UnknownChoice, UpstreamContactMode } from "@/domain/source";

type ActionId = (typeof SUPPLIER_ACTIONS)[number]["id"];

export default function SupplierPortalPage() {
  const params = useParams<{ token: string }>();
  const engine = useEngineState();
  const token = params.token || "demo";
  const direct = caseByPortalToken(engine, token);
  const questions = useMemo(() => {
    if (direct && token !== "demo") return [direct];
    const supplierId = direct?.supplierId ?? "supplier-a";
    return engine.cases.filter(
      (c) =>
        (c.supplierId === supplierId || c.portalToken === token) &&
        c.state !== "READY" &&
        c.state !== "MONITORING" &&
        c.state !== "RETURNED"
    );
  }, [direct, engine.cases, token]);

  const [step, setStep] = useState<"land" | "list" | "act" | "done">("land");
  const [caseId, setCaseId] = useState<string | null>(questions[0]?.id ?? null);
  const [action, setAction] = useState<ActionId | null>(null);
  const [value, setValue] = useState("67");
  const [share, setShare] = useState<"GRANTED" | "REQUEST_REQUIRED" | "DENIED">("GRANTED");
  const [unknown, setUnknown] = useState<UnknownChoice>("ask_supplier");
  const [upstreamMode, setUpstreamMode] = useState<UpstreamContactMode>("confidential");
  const [upstreamName, setUpstreamName] = useState("Nordic Fibre Mill");
  const [declineReason, setDeclineReason] = useState<DeclineReason>("commercially_confidential");
  const [colleague, setColleague] = useState("compliance@suppliera.example");
  const [message, setMessage] = useState<string | null>(null);

  const current = engine.cases.find((c) => c.id === caseId) ?? questions[0];
  const requirement = current ? engine.requirements.find((r) => r.id === current.requirementId) : undefined;

  function finish(text: string) {
    setMessage(text);
    setStep("done");
  }

  function run() {
    if (!current) return;
    if (action === "provide" || action === "upload" || action === "existing") {
      dispatchCommand({
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
      dispatchCommand({ type: "MARK_UNKNOWN", caseId: current.id, choice: unknown });
      finish("I don't know is a primary SOURCE flow. The case continues with a next owner.");
      return;
    }
    if (action === "upstream") {
      dispatchCommand({ type: "MARK_UNKNOWN", caseId: current.id, choice: "ask_supplier" });
      dispatchCommand({
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
      dispatchCommand({
        type: "ASSIGN_COLLEAGUE",
        caseId: current.id,
        contact: {
          actorId: current.currentActorId ?? current.supplierId ?? "supplier-a",
          role: "compliance",
          name: "Colleague",
          email: colleague,
        },
      });
      finish("The same scoped request was forwarded. You remain in the audit history.");
      return;
    }
    if (action === "decline") {
      dispatchCommand({ type: "DECLINE", caseId: current.id, reason: declineReason });
      finish("Refusal is recorded with a reason. SOURCE decides the next route — this is not a dead end.");
      return;
    }
    if (action === "wrong") {
      dispatchCommand({
        type: "MARK_WRONG_CONTACT",
        caseId: current.id,
        mode: "provide_contact",
        contact: { role: "compliance", name: "Colleague", email: colleague },
      });
      finish("Thank you. SOURCE will send the same request to the new person. No new case was created.");
    }
  }

  return (
    <div className="mx-auto min-h-full max-w-lg px-5 py-16">
      <SourceWordmark />
      {step === "land" ? (
        <>
          <h1 className="mt-10 font-[family-name:var(--font-space)] text-[28px] font-medium tracking-[-0.02em]">
            Acme Manufacturing requests product information.
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
            {questions.map((item) => {
              const need = engine.requirements.find((r) => r.id === item.requirementId);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="w-full border border-[#101A15]/10 bg-[#FBFCFA] px-4 py-3 text-left hover:border-[#0B6E50]/40"
                    onClick={() => {
                      setCaseId(item.id);
                      setStep("act");
                    }}
                  >
                    <div className="text-[14px]">{need?.propertyLabel}</div>
                    <div className="mt-1 text-[12px] text-[#101A15]/55">{need?.subjectLabel}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {step === "act" && current ? (
        <>
          <SourceLabel className="mt-10">{requirement?.subjectLabel}</SourceLabel>
          <h1 className="mt-2 font-[family-name:var(--font-space)] text-[24px] tracking-[-0.02em]">
            {requirement?.propertyLabel}
          </h1>
          <p className="mt-2 text-[13px] text-[#101A15]/60">Required for DPP compliance. Evidence preferred.</p>

          <div className="mt-6">
            <SourceLabel>Choose an action</SourceLabel>
            <div className="mt-3 grid gap-2">
              {SUPPLIER_ACTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAction(item.id)}
                  className={`border px-3 py-2 text-left text-[13px] ${
                    action === item.id ? "border-[#0B6E50] bg-[#0B6E50]/8" : "border-[#101A15]/10 bg-[#FBFCFA]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {action === "provide" || action === "upload" || action === "existing" ? (
            <div className="mt-6 space-y-4">
              <label className="block">
                <SourceLabel>Value</SourceLabel>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-24 rounded-sm border border-[#101A15]/15 bg-[#FBFCFA] px-3 py-2 font-[family-name:var(--font-plex)] text-[16px] outline-none"
                  />
                  <span className="text-[13px]">%</span>
                </div>
                <EvidenceLine className="mt-2" missing={action === "provide"} />
              </label>
              <div>
                <SourceLabel>Who may use this claim?</SourceLabel>
                <div className="mt-2 flex flex-col gap-2 text-[13px]">
                  <label>
                    <input type="radio" checked={share === "GRANTED"} onChange={() => setShare("GRANTED")} /> Verified customers
                  </label>
                  <label>
                    <input type="radio" checked={share === "REQUEST_REQUIRED"} onChange={() => setShare("REQUEST_REQUIRED")} /> Request permission
                  </label>
                  <label>
                    <input type="radio" checked={share === "DENIED"} onChange={() => setShare("DENIED")} /> Private
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          {action === "unknown" ? (
            <div className="mt-6 space-y-2 text-[13px]">
              {(
                [
                  ["ask_supplier", "Ask my supplier"],
                  ["assign_colleague", "Assign colleague"],
                  ["do_not_have", "I do not have this information"],
                  ["does_not_exist", "This information does not exist"],
                ] as const
              ).map(([id, label]) => (
                <label key={id} className="block">
                  <input type="radio" checked={unknown === id} onChange={() => setUnknown(id)} /> {label}
                </label>
              ))}
            </div>
          ) : null}

          {action === "upstream" ? (
            <div className="mt-6 space-y-4">
              <label className="block">
                <SourceLabel>Who supplies this component?</SourceLabel>
                <input
                  value={upstreamName}
                  onChange={(e) => setUpstreamName(e.target.value)}
                  className="mt-2 w-full rounded-sm border border-[#101A15]/15 bg-[#FBFCFA] px-3 py-2 text-[13px] outline-none"
                />
              </label>
              <div className="space-y-2 text-[13px]">
                <SourceLabel>How may SOURCE contact them?</SourceLabel>
                {(
                  [
                    ["on_behalf", "On my behalf"],
                    ["without_customer", "Without revealing my customer"],
                    ["confidential", "Keep this supplier identity confidential"],
                  ] as const
                ).map(([id, label]) => (
                  <label key={id} className="block">
                    <input type="radio" checked={upstreamMode === id} onChange={() => setUpstreamMode(id)} /> {label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {action === "colleague" || action === "wrong" ? (
            <label className="mt-6 block">
              <SourceLabel>Colleague email</SourceLabel>
              <input
                value={colleague}
                onChange={(e) => setColleague(e.target.value)}
                className="mt-2 w-full rounded-sm border border-[#101A15]/15 bg-[#FBFCFA] px-3 py-2 text-[13px] outline-none"
              />
            </label>
          ) : null}

          {action === "decline" ? (
            <label className="mt-6 block text-[13px]">
              <SourceLabel>Reason (required)</SourceLabel>
              <select
                className="mt-2 w-full rounded-sm border border-[#101A15]/15 bg-[#FBFCFA] px-3 py-2"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value as DeclineReason)}
              >
                <option value="commercially_confidential">Commercially confidential</option>
                <option value="contract_restriction">Contract restriction</option>
                <option value="no_permission">No permission</option>
                <option value="legal_restriction">Legal restriction</option>
                <option value="no_longer_supplied">No longer supplied</option>
                <option value="information_unavailable">Information unavailable</option>
                <option value="other">Other</option>
              </select>
            </label>
          ) : null}

          <SourceButton className="mt-8" onClick={run}>
            Continue
          </SourceButton>
        </>
      ) : null}

      {step === "done" ? (
        <>
          <h1 className="mt-10 font-[family-name:var(--font-space)] text-[28px] font-medium tracking-[-0.02em]">
            Recorded. The case is not stuck.
          </h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-[#101A15]/70">{message}</p>
          {current ? (
            <p className="mt-4 text-[13px] text-[#101A15]/60">
              Next: {engine.cases.find((c) => c.id === current.id)?.nextAction}
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-2">
            <SourceButton onClick={() => setStep("list")}>Answer another question</SourceButton>
            <SourceButton href="/app/missing" variant="ghost">
              View manufacturer case
            </SourceButton>
          </div>
          <div className="mt-8">
            <StatusPill tone="signal">No account wall stood in front of the answer</StatusPill>
          </div>
        </>
      ) : null}
    </div>
  );
}
