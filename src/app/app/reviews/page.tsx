"use client";

import Link from "next/link";
import { PageHeader } from "@/components/source/page-header";
import { EmptyState, SourceButton, SourceLabel } from "@/components/source/ui";
import { useDispatchCommand, useSourceQuery } from "@/client/source/api";

interface Task {
  id: string;
  caseId?: string;
  title: string;
  context: string;
  recommendedAction: string;
  kind: string;
  unlock: number;
  requirementsUnlocked?: number;
  minutesEstimate: number;
  candidateActorId?: string;
  tried?: string;
  why?: string;
  afterAction?: string;
}

export default function ReviewsPage() {
  const { data, reload } = useSourceQuery<{ tasks: Task[] }>("/api/source/needs-you");
  const dispatch = useDispatchCommand();
  const tasks = data?.tasks ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Needs you"
        description="SOURCE continues on its own until a decision only you can make. Each card is one action."
      />
      <div className="space-y-3">
        {tasks.map((task) => (
          <article key={task.id} className="border border-[#101A15]/10 bg-[#FBFCFA] p-5">
            <SourceLabel>
              {task.minutesEstimate} minutes of review could unblock {task.unlock} product{task.unlock === 1 ? "" : "s"}
              {task.requirementsUnlocked ? ` · ${task.requirementsUnlocked} requirements` : ""}
            </SourceLabel>
            <p className="mt-2 text-[16px]">{task.title}</p>
            {task.tried ? (
              <dl className="mt-3 space-y-2 text-[13px] text-[#101A15]/75">
                <div>
                  <SourceLabel>What SOURCE tried</SourceLabel>
                  <p className="mt-1">{task.tried}</p>
                </div>
                {task.why ? (
                  <div>
                    <SourceLabel>Why it stopped</SourceLabel>
                    <p className="mt-1">{task.why}</p>
                  </div>
                ) : null}
                {task.afterAction ? (
                  <div>
                    <SourceLabel>After you act</SourceLabel>
                    <p className="mt-1">{task.afterAction}</p>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="mt-1 text-[13px] text-[#101A15]/65">{task.context}</p>
            )}
            <p className="mt-2 text-[13px]">What you can do: {task.recommendedAction}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {task.kind === "identity" && task.caseId ? (
                <>
                  <SourceButton
                    onClick={() =>
                      void dispatch({
                        type: "CONFIRM_IDENTITY",
                        caseId: task.caseId!,
                        decision: "confirm",
                        actorId: task.candidateActorId,
                      }).then(reload)
                    }
                    disabled={!task.candidateActorId}
                  >
                    Confirm
                  </SourceButton>
                  <SourceButton
                    variant="ghost"
                    onClick={() => void dispatch({ type: "CONFIRM_IDENTITY", caseId: task.caseId!, decision: "reject" }).then(reload)}
                  >
                    Not the same
                  </SourceButton>
                </>
              ) : null}
              {task.kind === "conflict" && task.caseId ? (
                <>
                  <SourceButton onClick={() => void dispatch({ type: "RESOLVE_CONFLICT", caseId: task.caseId!, outcome: "manual_adjudication" }).then(reload)}>
                    Use newer
                  </SourceButton>
                  <SourceButton variant="ghost" onClick={() => void dispatch({ type: "RESOLVE_CONFLICT", caseId: task.caseId!, outcome: "different_scope" }).then(reload)}>
                    Review scope
                  </SourceButton>
                </>
              ) : null}
              {task.caseId ? (
                <SourceButton href={`/app/missing/${task.caseId}`} variant="ghost">
                  Open item
                </SourceButton>
              ) : null}
            </div>
          </article>
        ))}
        {tasks.length === 0 ? (
          <EmptyState
            title="Nothing needs you right now"
            description="SOURCE is working the rest, or there is no catalogue in this workspace yet."
            action={<SourceButton href="/app/import">Upload catalogue</SourceButton>}
          />
        ) : null}
      </div>
      <p className="mt-8">
        <Link href="/app/missing" className="text-[13px] hover:underline">
          All missing information
        </Link>
      </p>
    </div>
  );
}
