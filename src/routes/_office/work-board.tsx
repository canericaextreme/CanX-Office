import { createFileRoute, Link } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/office/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useManagerMemory } from "@/lib/use-manager-memory";
import {
  assignManagerTask,
  cancelManagerTask,
  createManagerTask,
  updateManagerTask,
  verifyManagerTask,
  type ManagerTask,
  type RiskLevel,
} from "@/lib/manager-work.functions";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { DEFAULT_TEAM, loadTeam, type TeamMember } from "@/lib/office-team";
import { taskExecutionEvidence } from "@/lib/task-execution-evidence";
import { WorkBoardDecision } from "@/components/office/WorkBoardDecision";
import { decisionsForJohn, type DecisionItem } from "@/lib/work-board-decisions";

export const Route = createFileRoute("/_office/work-board")({
  head: () => ({
    meta: [
      { title: "CanX Office" },
      { name: "description", content: "Owner-only CanX operations workspace." },
      { property: "og:title", content: "CanX Office" },
      { property: "og:description", content: "Owner-only CanX operations workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkBoard,
});

const RISK_WORDS: Record<RiskLevel, string> = {
  green: "Green — Manager may proceed",
  yellow: "Yellow — needs your approval",
  red: "Red — stopped",
};

type StatusTone = "green" | "yellow" | "red" | "grey";

interface TaskStatus {
  tone: StatusTone;
  label: string;
  /** Plain-language context; colour alone never conveys task state. */
  reason: string | null;
}

/** Milliseconds after which an unfinished task with no update is stale. */
const STALE_MS = 14 * 24 * 60 * 60 * 1000;

/** Display only: these colours never change risk gates or task permissions. */
function taskStatus(task: ManagerTask): TaskStatus {
  // Protection takes precedence even over a saved done/stale state.
  if (task.risk === "red") {
    return {
      tone: "red",
      label: "Red — protected / integrity risk",
      reason: "Protected task: review its saved risk and evidence before taking action.",
    };
  }
  const updated = new Date(task.updated_at).getTime();
  const isStale =
    (task.status === "open" || task.status === "in_progress") &&
    Number.isFinite(updated) &&
    Date.now() - updated > STALE_MS;

  if (task.risk === "yellow" && (task.status === "open" || task.status === "in_progress")) {
    return {
      tone: "yellow",
      label: "Yellow — needs attention",
      reason: "Yellow-risk work: check its approval and evidence before proceeding.",
    };
  }
  if (isStale) {
    return {
      tone: "yellow",
      label: "Yellow — stale",
      reason: "No update recorded in over 14 days.",
    };
  }
  switch (task.status) {
    case "done":
      return { tone: "green", label: "Green — done", reason: null };
    case "waiting":
      return {
        tone: "yellow",
        label: "Yellow — waiting",
        reason: task.waiting_reason || "Waiting reason not recorded.",
      };
    case "in_progress":
      return {
        tone: "green",
        label: "Green — clear / assigned",
        reason: "Assignment alone does not confirm that work is running.",
      };
    case "cancelled":
      return { tone: "grey", label: "Grey — cancelled", reason: null };
    case "open":
      return {
        tone: "grey",
        label: "Grey — not started",
        reason: "Not assigned to a worker yet.",
      };
    default:
      return {
        tone: "yellow",
        label: "Yellow — unknown",
        reason: "The saved status is not recognized.",
      };
  }
}

function when(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

export function WorkBoard() {
  const { memory, loading, error, isOwner, accessToken, sessionMessage, refresh } =
    useManagerMemory();
  const createTask = useServerFn(createManagerTask);
  const assignTask = useServerFn(assignManagerTask);
  const verifyTask = useServerFn(verifyManagerTask);
  const editTask = useServerFn(updateManagerTask);
  const cancelTask = useServerFn(cancelManagerTask);

  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [project, setProject] = useState("");
  const [risk, setRisk] = useState<RiskLevel>("green");
  const [waitingReason, setWaitingReason] = useState<Record<string, string>>({});
  const [worker, setWorker] = useState<Record<string, string>>({});
  const [team, setTeam] = useState<TeamMember[]>(DEFAULT_TEAM);
  useEffect(() => {
    const sync = () => setTeam(loadTeam());
    sync();
    window.addEventListener("canx:team-changed", sync);
    return () => window.removeEventListener("canx:team-changed", sync);
  }, []);
  const [result, setResult] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<
    Record<
      string,
      { title: string; detail: string; project: string; result: string; evidence: string }
    >
  >({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);

  const tasks = memory?.tasks ?? null;
  const assignments = memory?.assignments ?? [];
  const approvals = memory?.approvals ?? [];
  // Everything waiting on John: Approval Box requests, tasks on hold and unapproved yellow tasks.
  const decisions = tasks ? decisionsForJohn(tasks, approvals) : [];
  const decisionFor: Record<string, DecisionItem> = {};
  for (const item of decisions) if (item.kind !== "approval") decisionFor[item.id] = item;
  const approvalDecisions = decisions.filter((item) => item.kind === "approval");
  const shownTasks = onlyMine ? tasks?.filter((task) => decisionFor[task.id]) : tasks;
  const decided = (message: string) => {
    setProblem(null);
    setNotice(message);
    refresh();
  };
  // Tasks that came from, or are covered by, an approval you granted.
  const approvedOn: Record<string, string> = {};
  for (const approval of approvals) {
    if (approval.status === "approved" && approval.task_id) {
      approvedOn[approval.task_id] = approval.decided_at ?? approval.created_at;
    }
  }

  // When the Office Manager creates or changes a task — including from a spoken
  // command — the board reloads so John sees the real record straight away.
  useEffect(() => {
    const onChanged = () => refresh();
    window.addEventListener("canx:workbench-changed", onChanged);
    return () => window.removeEventListener("canx:workbench-changed", onChanged);
  }, [refresh]);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setNotice(null);
    setProblem(null);
    try {
      const res = (await fn()) as { ok?: boolean; message?: string };
      if (res && res.ok === false) setProblem(res.message ?? "That action could not be saved.");
      else {
        setNotice(done);
        refresh();
      }
    } catch {
      setProblem("That action could not be saved. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <RoomShell>
      <datalist id="canx-team-names">
        {team.map((member) => (
          <option key={member.id} value={member.name} />
        ))}
      </datalist>
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Master task list</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {tasks ? (
                <span className="text-xs text-muted-foreground">
                  Shared memory — saved in the CanX-owned database.
                </span>
              ) : isOwner ? (
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone="grey" label="Grey — disconnected" />
                  <span className="text-xs text-muted-foreground">
                    {error ?? "The shared task list could not be read."}
                  </span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">{sessionMessage}</span>
              )}
              {isOwner && (
                <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                  {loading ? "Checking…" : "Refresh"}
                </Button>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Assigned jobs start when a worker begins execution
          </p>
          <p className="text-xs text-muted-foreground">
            Green — clear/good · Yellow — needs attention · Red — protected or integrity risk. Clear
            does not mean running or verified; check the status and evidence.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {notice && (
            <p role="status" className="text-xs text-canx-green">
              {notice}
            </p>
          )}
          {problem && (
            <p role="alert" className="text-xs text-destructive">
              {problem}
            </p>
          )}

          {isOwner && tasks && (
            <section
              aria-labelledby="needs-john-heading"
              className={
                decisions.length > 0
                  ? "rounded-lg border-2 border-canx-yellow bg-canx-yellow/10 p-3"
                  : "rounded-lg border border-canx-green/60 p-3"
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2
                  id="needs-john-heading"
                  className={
                    decisions.length > 0
                      ? "text-base font-semibold text-canx-yellow"
                      : "text-sm text-canx-green"
                  }
                >
                  {decisions.length === 0
                    ? "Nothing is waiting on you right now."
                    : decisions.length === 1
                      ? "John — 1 item needs your decision"
                      : `John — ${decisions.length} items need your decision`}
                </h2>
                {decisions.length > 0 && (
                  <Button
                    variant={onlyMine ? "default" : "outline"}
                    className="h-11"
                    aria-pressed={onlyMine}
                    onClick={() => setOnlyMine((v) => !v)}
                  >
                    {onlyMine ? "Show all tasks" : `Show only what needs me (${decisions.length})`}
                  </Button>
                )}
              </div>
              {decisions.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Each one has Approve and Decline on its card, marked “John — review needed”. Every
                  button asks you to confirm first.
                </p>
              )}
              {decisions.some((item) => item.kind !== "approval") && (
                <ul className="mt-2 space-y-1 text-sm">
                  {decisions
                    .filter((item) => item.kind !== "approval")
                    .map((item) => (
                      <li key={item.id}>
                        <a className="underline" href={`#task-${item.id}`}>
                          Open details: {item.title}
                        </a>
                      </li>
                    ))}
                </ul>
              )}
              {approvalDecisions.map((item) => (
                <div
                  key={item.id}
                  className="mt-3 rounded-lg border-2 border-canx-yellow bg-card p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-canx-yellow px-2 py-0.5 text-xs font-semibold text-black">
                      John — review needed
                    </span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      Approval Box request
                    </span>
                    <span className="font-medium">{item.title}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{item.why}</p>
                  {item.kind === "approval" && item.approval.cost_cents != null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Estimated cost: {(item.approval.cost_cents / 100).toFixed(2)}
                    </p>
                  )}
                  <WorkBoardDecision item={item} accessToken={accessToken} onDone={decided} />
                </div>
              ))}
              <p className="mt-2 text-xs text-muted-foreground">
                Past decisions stay in the{" "}
                <Link to="/approvals" className="underline">
                  Approval Box history
                </Link>
                .
              </p>
            </section>
          )}

          {loading && !tasks && (
            <p className="text-sm text-muted-foreground">Loading your task list…</p>
          )}

          {!isOwner && !loading && (
            <p className="text-sm text-muted-foreground">
              Sign in as the owner with two-step verification to see and change the task list.
            </p>
          )}

          {isOwner && !loading && !tasks && (
            <p className="text-sm text-destructive">
              {error ?? "The shared task list could not be read, so nothing is shown."}
            </p>
          )}

          {tasks && tasks.length === 0 && (
            <p className="text-sm text-muted-foreground">No records yet.</p>
          )}

          {shownTasks?.map((task) => {
            const needs = decisionFor[task.id];
            const taskAssignments = assignments.filter((a) => a.task_id === task.id);
            const edit = editing[task.id];
            const status = taskStatus(task);
            return (
              <div
                key={task.id}
                id={`task-${task.id}`}
                className={`min-w-0 scroll-mt-24 rounded-lg border-2 p-3 [overflow-wrap:anywhere] ${
                  status.tone === "red"
                    ? "border-destructive bg-destructive/5"
                    : status.tone === "yellow"
                      ? "border-canx-yellow bg-canx-yellow/5"
                      : status.tone === "grey"
                        ? "border-border bg-muted/30"
                        : "border-canx-green/60 bg-canx-green/5"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {needs && (
                    <span className="rounded-full bg-canx-yellow px-2 py-0.5 text-xs font-semibold text-black">
                      John — review needed
                    </span>
                  )}
                  <StatusBadge tone={status.tone} label={status.label} />
                  <span className="min-w-0 font-medium">{task.title}</span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {RISK_WORDS[task.risk]}
                  </span>
                  {approvedOn[task.id] && (
                    <span className="rounded-full border border-canx-green/60 px-2 py-0.5 text-xs text-canx-green">
                      Approved by you — {when(approvedOn[task.id])}
                    </span>
                  )}
                </div>
                {needs ? (
                  <>
                    <p className="mt-2 text-sm">
                      <span className="font-semibold text-canx-yellow">
                        {needs.kind === "on-hold" ? "Why it is waiting: " : "Why you are asked: "}
                      </span>
                      {needs.why}
                    </p>
                    <WorkBoardDecision item={needs} accessToken={accessToken} onDone={decided} />
                  </>
                ) : (
                  status.reason && (
                    <p className="mt-1 text-xs text-muted-foreground">{status.reason}</p>
                  )
                )}
                <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    <dt className="inline font-medium">Project: </dt>
                    <dd className="inline">{task.project?.trim() || "Not stated"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Assigned to: </dt>
                    <dd className="inline">{task.worker?.trim() || "Nobody yet"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Created: </dt>
                    <dd className="inline">{when(task.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium">Updated: </dt>
                    <dd className="inline">{when(task.updated_at)}</dd>
                  </div>
                </dl>
                {isOwner &&
                  (task.status === "open" ||
                    task.status === "in_progress" ||
                    task.status === "waiting") && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Input
                        className="max-w-sm"
                        aria-label={`What ${task.title} is waiting for`}
                        placeholder="Waiting for approval, information or verification"
                        value={waitingReason[task.id] ?? task.waiting_reason ?? ""}
                        onChange={(e) =>
                          setWaitingReason((current) => ({ ...current, [task.id]: e.target.value }))
                        }
                      />
                      <Button
                        variant="outline"
                        disabled={
                          busy === task.id ||
                          !accessToken ||
                          !(waitingReason[task.id] ?? task.waiting_reason ?? "").trim()
                        }
                        onClick={() =>
                          run(
                            task.id,
                            () =>
                              editTask({
                                data: {
                                  accessToken: accessToken!,
                                  taskId: task.id,
                                  title: task.title,
                                  detail: task.detail,
                                  project: task.project ?? "",
                                  risk: task.risk,
                                  status: "waiting",
                                  waiting_reason:
                                    waitingReason[task.id] ?? task.waiting_reason ?? "",
                                },
                              }),
                            "Saved waiting status.",
                          )
                        }
                      >
                        Mark waiting
                      </Button>
                      {task.status === "waiting" && (
                        <Button
                          variant="outline"
                          disabled={busy === task.id || !accessToken}
                          onClick={() =>
                            run(
                              task.id,
                              () =>
                                editTask({
                                  data: {
                                    accessToken: accessToken!,
                                    taskId: task.id,
                                    title: task.title,
                                    detail: task.detail,
                                    project: task.project ?? "",
                                    risk: task.risk,
                                    status: "open",
                                  },
                                }),
                              "Returned to planned work.",
                            )
                          }
                        >
                          Return to planned
                        </Button>
                      )}
                    </div>
                  )}
                {task.detail && <p className="mt-2 text-xs text-muted-foreground">{task.detail}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  Result: {task.result?.trim() || "Not recorded"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Evidence:{" "}
                  {taskExecutionEvidence(task.evidence)?.label ??
                    (task.evidence?.trim() || "Not recorded")}
                </p>
                {taskExecutionEvidence(task.evidence)?.url && (
                  <a
                    className="text-xs underline"
                    href={taskExecutionEvidence(task.evidence)!.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open this task’s build
                  </a>
                )}
                {taskAssignments.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {taskAssignments.length} assignment{taskAssignments.length === 1 ? "" : "s"}{" "}
                    recorded · latest {when(taskAssignments[0]?.assigned_at)}
                  </p>
                )}

                {task.risk === "red" && task.status !== "cancelled" && (
                  <p className="mt-2 text-xs text-destructive">
                    Red: this operation is stopped. It cannot be assigned or approved from here.
                  </p>
                )}

                {isOwner && task.status === "open" && task.risk !== "red" && (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <div>
                      <Label className="text-xs" htmlFor={`worker-${task.id}`}>
                        Worker
                      </Label>
                      <Input
                        id={`worker-${task.id}`}
                        list="canx-team-names"
                        className="h-11 w-full sm:w-[220px]"
                        placeholder="Worker name"
                        value={worker[task.id] ?? ""}
                        onChange={(e) => setWorker((w) => ({ ...w, [task.id]: e.target.value }))}
                      />
                    </div>
                    <Button
                      className="h-11"
                      disabled={busy === task.id || !(worker[task.id] ?? "").trim() || !accessToken}
                      onClick={() =>
                        run(
                          task.id,
                          () =>
                            assignTask({
                              data: {
                                accessToken: accessToken!,
                                taskId: task.id,
                                worker: worker[task.id] ?? "",
                              },
                            }),
                          "Assigned and recorded.",
                        )
                      }
                    >
                      {busy === task.id ? "Saving…" : "Assign"}
                    </Button>
                  </div>
                )}

                {isOwner && task.status === "in_progress" && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs" htmlFor={`result-${task.id}`}>
                        What was done
                      </Label>
                      <Input
                        id={`result-${task.id}`}
                        className="h-11"
                        value={result[task.id] ?? ""}
                        onChange={(e) => setResult((r) => ({ ...r, [task.id]: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs" htmlFor={`evidence-${task.id}`}>
                        Evidence
                      </Label>
                      <Input
                        id={`evidence-${task.id}`}
                        className="h-11"
                        value={evidence[task.id] ?? ""}
                        onChange={(e) => setEvidence((r) => ({ ...r, [task.id]: e.target.value }))}
                      />
                    </div>
                    <Button
                      className="h-11 sm:col-span-2 sm:w-fit"
                      disabled={busy === task.id || !(result[task.id] ?? "").trim() || !accessToken}
                      onClick={() =>
                        run(
                          task.id,
                          () =>
                            verifyTask({
                              data: {
                                accessToken: accessToken!,
                                taskId: task.id,
                                result: result[task.id] ?? "",
                                evidence: evidence[task.id] ?? "",
                              },
                            }),
                          "Verified and closed.",
                        )
                      }
                    >
                      {busy === task.id ? "Saving…" : "Verify and complete"}
                    </Button>
                  </div>
                )}

                {isOwner && task.status !== "done" && task.status !== "cancelled" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setEditing((e) =>
                          e[task.id]
                            ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== task.id))
                            : {
                                ...e,
                                [task.id]: {
                                  title: task.title,
                                  detail: task.detail,
                                  project: task.project ?? "",
                                  result: task.result ?? "",
                                  evidence: task.evidence ?? "",
                                },
                              },
                        )
                      }
                    >
                      {edit ? "Close edit" : "Edit"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy === task.id || !accessToken}
                      onClick={() =>
                        run(
                          task.id,
                          () =>
                            cancelTask({
                              data: { accessToken: accessToken!, taskId: task.id, reason: "" },
                            }),
                          "Task cancelled. Nothing was deleted.",
                        )
                      }
                    >
                      Cancel task
                    </Button>
                  </div>
                )}

                {isOwner && edit && (
                  <div className="mt-3 space-y-2 rounded-md border border-border p-3">
                    <Label className="text-xs" htmlFor={`edit-title-${task.id}`}>
                      Title
                    </Label>
                    <Input
                      id={`edit-title-${task.id}`}
                      className="h-11"
                      value={edit.title}
                      onChange={(e) =>
                        setEditing((s) => ({ ...s, [task.id]: { ...edit, title: e.target.value } }))
                      }
                    />
                    <Label className="text-xs" htmlFor={`edit-detail-${task.id}`}>
                      Details
                    </Label>
                    <Textarea
                      id={`edit-detail-${task.id}`}
                      value={edit.detail}
                      onChange={(e) =>
                        setEditing((s) => ({
                          ...s,
                          [task.id]: { ...edit, detail: e.target.value },
                        }))
                      }
                    />
                    <Label className="text-xs" htmlFor={`edit-project-${task.id}`}>
                      Project
                    </Label>
                    <Input
                      id={`edit-project-${task.id}`}
                      className="h-11"
                      value={edit.project}
                      onChange={(e) =>
                        setEditing((s) => ({
                          ...s,
                          [task.id]: { ...edit, project: e.target.value },
                        }))
                      }
                    />
                    <Label className="text-xs" htmlFor={`edit-result-${task.id}`}>
                      Result
                    </Label>
                    <Input
                      id={`edit-result-${task.id}`}
                      className="h-11"
                      value={edit.result}
                      onChange={(e) =>
                        setEditing((s) => ({
                          ...s,
                          [task.id]: { ...edit, result: e.target.value },
                        }))
                      }
                    />
                    <Label className="text-xs" htmlFor={`edit-evidence-${task.id}`}>
                      Evidence
                    </Label>
                    <Input
                      id={`edit-evidence-${task.id}`}
                      className="h-11"
                      value={taskExecutionEvidence(edit.evidence)?.label ?? edit.evidence}
                      readOnly={Boolean(taskExecutionEvidence(edit.evidence))}
                      onChange={(e) =>
                        setEditing((s) => ({
                          ...s,
                          [task.id]: { ...edit, evidence: e.target.value },
                        }))
                      }
                    />
                    <Button
                      className="h-11"
                      disabled={busy === task.id || !edit.title.trim() || !accessToken}
                      onClick={() =>
                        run(
                          task.id,
                          async () => {
                            const res = await editTask({
                              data: {
                                accessToken: accessToken!,
                                taskId: task.id,
                                title: edit.title,
                                detail: edit.detail,
                                project: edit.project,
                                result: edit.result,
                                evidence: edit.evidence,
                                risk: task.risk,
                              },
                            });
                            setEditing((s) =>
                              Object.fromEntries(Object.entries(s).filter(([k]) => k !== task.id)),
                            );
                            return res;
                          },
                          "Task updated.",
                        )
                      }
                    >
                      Save changes
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="mt-6 border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Add a task</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs" htmlFor="new-title">
                Title
              </Label>
              <Input
                id="new-title"
                className="h-11"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs" htmlFor="new-project">
                  Project
                </Label>
                <Input
                  id="new-project"
                  className="h-11"
                  placeholder="Safe Highways, Trail Tales, Finance…"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs" htmlFor="new-risk">
                  Risk
                </Label>
                <select
                  id="new-risk"
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={risk}
                  onChange={(e) => setRisk(e.target.value as RiskLevel)}
                >
                  <option value="green">Green — Manager may proceed</option>
                  <option value="yellow">Yellow — needs your approval</option>
                  <option value="red">Red — stopped</option>
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs" htmlFor="new-detail">
                Details
              </Label>
              <Textarea
                id="new-detail"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
              />
            </div>
            <Button
              className="h-11"
              disabled={busy === "new" || !title.trim() || !accessToken}
              onClick={() =>
                run(
                  "new",
                  async () => {
                    const res = await createTask({
                      data: { accessToken: accessToken!, title, detail, risk, project },
                    });
                    setTitle("");
                    setDetail("");
                    setProject("");
                    setRisk("green");
                    return res;
                  },
                  "Task added to the master list.",
                )
              }
            >
              {busy === "new" ? "Saving…" : "Add task"}
            </Button>
          </CardContent>
        </Card>
      )}
    </RoomShell>
  );
}
