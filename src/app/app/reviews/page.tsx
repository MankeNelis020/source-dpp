"use client";

import Link from "next/link";
import { PageHeader } from "@/components/source/page-header";
import { SourceButton, SourceLabel } from "@/components/source/ui";
import { useDispatchCommand, useSourceQuery } from "@/client/source/api";

interface Task {
  id: string;
  caseId?: string;
  title: string;
  context: string;
  recommendedAction: string;
  kind: string;
  unlock: number;
  minutesEstimate: number;
}

export default function ReviewsPage() {
  const { data, reload } = useSourceQuery<{ tasks: Task[] }>("/api/source/needs-you");
  const dispatch = useDispatchCommand();
  const tasks = data?.tasks ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Needs you"
        description="Sorted by unlock: the next minutes should free the most products. Each card is one decision."
      />
      <div className="space-y-3">
        {tasks.map((task) => (
          <article key={task.id} className="border border-[#101A15]/10 bg-[#FBFCFA] p-5">
            <SourceLabel>
              {task.minutesEstimate} minutes to unblock {task.unlock} product{task.unlock === 1 ? "" : "s"}
            </SourceLabel>
            <p className="mt-2 text-[16px]">{task.title}</p>
            <p className="mt-1 text-[13px] text-[#101A15]/65">{task.context}</p>
            <p className="mt-2 text-[13px]">Recommended: {task.recommendedAction}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {task.kind === "identity" && task.caseId ? (
                <>
                  <SourceButton
                    onClick={() =>
                      void dispatch({ type: "CONFIRM_IDENTITY", caseId: task.caseId!, decision: "confirm", actorId: "acme-alu-gmbh" }).then(reload)
                    }
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
                  Open case
                </SourceButton>
              ) : null}
            </div>
          </article>
        ))}
        {tasks.length === 0 ? <p className="text-[13px] text-[#0B6E50]">No blockers need you right now. SOURCE is working the rest.</p> : null}
      </div>
      <p className="mt-8">
        <Link href="/app/missing" className="text-[13px] hover:underline">
          All resolution cases
        </Link>
      </p>
    </div>
  );
}
