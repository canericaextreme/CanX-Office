import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  cancelManagerTask,
  decideManagerApproval,
  requestManagerApproval,
  updateManagerTask,
  type ManagerTask,
} from "@/lib/manager-work.functions";
import {
  ACTION_DONE,
  confirmWords,
  declineResult,
  resumeStatus,
  type DecisionAction,
  type DecisionItem,
} from "@/lib/work-board-decisions";

type Outcome = { ok?: boolean; message?: string; id?: string } | null | undefined;

const failed = (res: Outcome) => !res || res.ok === false;

/**
 * Approve / Decline on a Work Board card that is waiting on John. Every click
 * asks to confirm first, then uses the Office's existing owner-checked actions
 * (the same ones as the Approval Box and the task buttons). Task decisions are
 * also written to the approval history, so "Approved by you" shows afterwards.
 */
export function WorkBoardDecision({
  item,
  accessToken,
  onDone,
}: {
  item: DecisionItem;
  accessToken: string | null;
  onDone: (message: string) => void;
}) {
  const request = useServerFn(requestManagerApproval);
  const decide = useServerFn(decideManagerApproval);
  const update = useServerFn(updateManagerTask);
  const cancel = useServerFn(cancelManagerTask);
  const [asking, setAsking] = useState<DecisionAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function recordTaskDecision(
    task: ManagerTask,
    decision: "approved" | "declined",
  ): Promise<string | null> {
    const asked = (await request({
      data: {
        accessToken: accessToken!,
        title: `Work Board decision: ${task.title}`.slice(0, 300),
        detail: item.why,
        risk: "yellow",
        taskId: task.id,
      },
    })) as Outcome;
    if (failed(asked) || !asked?.id)
      return asked?.message ?? "Your decision could not be recorded. Nothing changed.";
    const decided = (await decide({
      data: { accessToken: accessToken!, approvalId: asked.id, decision },
    })) as Outcome;
    if (failed(decided)) {
      return `${decided?.message ?? "Your decision could not be saved."} The request is waiting in the Approval Box; the task was not changed.`;
    }
    return null;
  }

  async function act(action: DecisionAction) {
    if (!accessToken) return;
    setBusy(true);
    setProblem(null);
    try {
      if (item.kind === "approval") {
        const res = (await decide({
          data: {
            accessToken,
            approvalId: item.id,
            decision: action === "approve" ? "approved" : "declined",
          },
        })) as Outcome;
        if (failed(res)) return setProblem(res?.message ?? "That was not saved. Nothing changed.");
      } else {
        const task = item.task;
        const recordProblem = await recordTaskDecision(
          task,
          action === "approve" ? "approved" : "declined",
        );
        if (recordProblem) return setProblem(recordProblem);
        let res: Outcome = { ok: true };
        if (action === "decline") {
          res = (await cancel({
            data: { accessToken, taskId: task.id, reason: declineResult(task, new Date()) },
          })) as Outcome;
        } else if (item.kind === "on-hold") {
          // Title, detail, project and risk go back unchanged; only the status moves.
          res = (await update({
            data: {
              accessToken,
              taskId: task.id,
              title: task.title,
              detail: task.detail,
              project: task.project ?? "",
              risk: task.risk,
              status: resumeStatus(task),
            },
          })) as Outcome;
        }
        if (failed(res)) {
          return setProblem(
            `Your decision was recorded, but the task itself did not change: ${res?.message ?? "the save failed"}. Try again or use the task's own buttons.`,
          );
        }
      }
      setAsking(null);
      window.dispatchEvent(new CustomEvent("canx:workbench-changed"));
      onDone(ACTION_DONE[item.kind][action]);
    } catch {
      setProblem(
        "That could not be confirmed. Refresh the board to see what was saved before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-md border-2 border-canx-yellow/80 bg-canx-yellow/10 p-3">
      {asking ? (
        <div role="group" aria-label={`Confirm ${asking} for ${item.title}`} className="space-y-2">
          <p className="text-sm">{confirmWords(item, asking)}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              className={
                asking === "approve"
                  ? "h-11 bg-canx-green text-black hover:bg-canx-green/90"
                  : "h-11 bg-canx-red text-white hover:bg-canx-red/90"
              }
              disabled={busy || !accessToken}
              onClick={() => act(asking)}
            >
              {busy ? "Saving…" : asking === "approve" ? "Yes, approve" : "Yes, decline"}
            </Button>
            <Button
              variant="outline"
              className="h-11"
              disabled={busy}
              onClick={() => setAsking(null)}
            >
              Go back
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-sm font-semibold text-canx-yellow sm:mr-auto">Your decision:</span>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button
              className="h-11 bg-canx-green text-black hover:bg-canx-green/90 sm:min-w-[8rem]"
              disabled={!accessToken}
              aria-label={`Approve ${item.title}`}
              onClick={() => setAsking("approve")}
            >
              ✓ Approve
            </Button>
            <Button
              variant="outline"
              className="h-11 border-2 border-canx-red text-canx-red hover:bg-canx-red/10 sm:min-w-[8rem]"
              disabled={!accessToken}
              aria-label={`Decline ${item.title}`}
              onClick={() => setAsking("decline")}
            >
              ✕ Decline
            </Button>
          </div>
        </div>
      )}
      {problem && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {problem}
        </p>
      )}
    </div>
  );
}
