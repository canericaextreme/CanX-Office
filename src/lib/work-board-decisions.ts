import type { ManagerApproval, ManagerTask } from "@/lib/manager-work.functions";

/**
 * Which Work Board items are waiting on John, and exactly what his Approve and
 * Decline buttons will do. Pure, so the rules are tested without a database.
 *
 * - "approval": a pending Approval Box request.
 * - "on-hold": a task parked with status "waiting".
 * - "yellow": a yellow-risk task ("needs your approval") John has not approved yet.
 *
 * Red tasks are never offered an Approve button: they stay stopped.
 */
export type DecisionKind = "approval" | "on-hold" | "yellow";

export type DecisionItem =
  | { kind: "approval"; id: string; title: string; why: string; approval: ManagerApproval }
  | { kind: "on-hold" | "yellow"; id: string; title: string; why: string; task: ManagerTask };

export type DecisionAction = "approve" | "decline";

/** The task's result field holds at most this many characters on the server. */
const RESULT_LIMIT = 2000;

/** Task ids covered by an approval John already gave or refused. */
export function decidedTaskIds(approvals: ManagerApproval[]): Set<string> {
  const ids = new Set<string>();
  for (const a of approvals) if (a.task_id && a.status !== "pending") ids.add(a.task_id);
  return ids;
}

/** Why a task needs John, or null when it does not. */
export function taskDecision(task: ManagerTask, decided: Set<string>): DecisionItem | null {
  if (task.risk === "red") return null;
  if (task.status === "waiting") {
    return {
      kind: "on-hold",
      id: task.id,
      title: task.title,
      why: task.waiting_reason?.trim() || "The reason it is on hold was not recorded.",
      task,
    };
  }
  if (
    task.risk === "yellow" &&
    (task.status === "open" || task.status === "in_progress") &&
    !decided.has(task.id)
  ) {
    return {
      kind: "yellow",
      id: task.id,
      title: task.title,
      why: "Yellow risk: this task needs your approval before work goes ahead.",
      task,
    };
  }
  return null;
}

/** Everything waiting on John: Approval Box requests first, then tasks in board order. */
export function decisionsForJohn(
  tasks: ManagerTask[],
  approvals: ManagerApproval[],
): DecisionItem[] {
  const decided = decidedTaskIds(approvals);
  const items: DecisionItem[] = approvals
    .filter((a) => a.status === "pending")
    .map((a) => ({
      kind: "approval" as const,
      id: a.id,
      title: a.title,
      why: a.detail?.trim() || "No detail was recorded with this request.",
      approval: a,
    }));
  for (const task of tasks) {
    const item = taskDecision(task, decided);
    if (item) items.push(item);
  }
  return items;
}

/** The status a resumed task goes back to: in progress when someone is assigned, otherwise planned. */
export function resumeStatus(task: ManagerTask): "open" | "in_progress" {
  return task.worker?.trim() ? "in_progress" : "open";
}

/**
 * The result text saved when John declines a task. The earlier result is kept
 * word for word with the decline note after it; if both would not fit, the
 * earlier result is left untouched (empty reason) rather than cut.
 */
export function declineResult(task: ManagerTask, at: Date): string {
  const note = `Declined by John on the Work Board, ${at.toISOString().slice(0, 10)}.`;
  const earlier = task.result?.trim() ?? "";
  if (!earlier) return note;
  const combined = `${earlier}\n\n${note}`;
  return combined.length <= RESULT_LIMIT ? combined : "";
}

/** What the button will really do, said plainly before John confirms. */
export function confirmWords(item: DecisionItem, action: DecisionAction): string {
  if (item.kind === "approval") {
    const cost = item.approval.cost_cents
      ? ` (estimated cost ${(item.approval.cost_cents / 100).toFixed(2)})`
      : "";
    return action === "approve"
      ? `Approve this request${cost}? It is recorded as approved and goes onto the Work Board as approved work. Nothing is published, merged or paid for by this click.`
      : "Decline this request? It is recorded as declined in the approval history. Nothing is deleted.";
  }
  if (action === "decline") {
    return "Decline this task? Your decision is recorded, and the task is set aside as cancelled with a note saying you declined it. Nothing is deleted and its history stays.";
  }
  return item.kind === "on-hold"
    ? `Approve and resume? Your go-ahead is recorded and the task goes back to ${resumeStatus(item.task) === "in_progress" ? "in progress" : "planned work"}. It does not start a paid build, merge or publish anything by itself.`
    : "Approve this task? Your approval is recorded on it and work may go ahead. It does not start a paid build, merge or publish anything by itself.";
}

export const ACTION_DONE: Record<DecisionKind, Record<DecisionAction, string>> = {
  approval: {
    approve: "Approved. It is on the Work Board as approved work.",
    decline: "Declined and recorded.",
  },
  "on-hold": {
    approve: "Approved and resumed.",
    decline: "Declined. The task is cancelled; nothing was deleted.",
  },
  yellow: {
    approve: "Approved. Work may go ahead.",
    decline: "Declined. The task is cancelled; nothing was deleted.",
  },
};
