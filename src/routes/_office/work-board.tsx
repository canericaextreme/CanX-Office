import { createFileRoute } from "@tanstack/react-router";
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
import { useState } from "react";

export const Route = createFileRoute("/_office/work-board")({
  head: () => ({
    meta: [
      { title: "CanX Office — Work Board" },
      { name: "description", content: "Canonical work queue for CanX Office." },
      { property: "og:title", content: "CanX Office — Work Board" },
      { property: "og:description", content: "Canonical work queue for CanX Office." },
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

function statusTone(status: ManagerTask["status"]) {
  if (status === "done") return "green" as const;
  if (status === "in_progress") return "blue" as const;
  if (status === "cancelled") return "red" as const;
  return "grey" as const;
}

function statusLabel(status: ManagerTask["status"]): string {
  if (status === "in_progress") return "Blue — actively moving";
  return status.replace("_", " ");
}

function when(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

function WorkBoard() {
  const { memory, loading, error, isOwner, accessToken, sessionMessage, refresh } = useManagerMemory();
  const createTask = useServerFn(createManagerTask);
  const assignTask = useServerFn(assignManagerTask);
  const verifyTask = useServerFn(verifyManagerTask);
  const editTask = useServerFn(updateManagerTask);
  const cancelTask = useServerFn(cancelManagerTask);

  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [project, setProject] = useState("");
  const [risk, setRisk] = useState<RiskLevel>("green");
  const [worker, setWorker] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<
    Record<string, { title: string; detail: string; project: string; result: string; evidence: string }>
  >({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const tasks = memory?.tasks ?? null;
  const assignments = memory?.assignments ?? [];

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
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Master task list</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {tasks
                  ? "Shared memory — saved in the CanX-owned database."
                  : isOwner
                    ? (error ?? "The shared task list could not be read.")
                    : sessionMessage}
              </span>
              {isOwner && (
                <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                  {loading ? "Checking…" : "Refresh"}
                </Button>
              )}
            </div>
          </div>
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

          {loading && !tasks && <p className="text-sm text-muted-foreground">Loading your task list…</p>}

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

          {tasks && tasks.length === 0 && <p className="text-sm text-muted-foreground">No records yet.</p>}

          {tasks?.map((task) => {
            const taskAssignments = assignments.filter((a) => a.task_id === task.id);
            const edit = editing[task.id];
            return (
              <div key={task.id} className="rounded-lg border border-border/50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={statusTone(task.status)} label={statusLabel(task.status)} />
                  <span className="font-medium">{task.title}</span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {RISK_WORDS[task.risk]}
                  </span>
                </div>
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
                {task.detail && <p className="mt-2 text-xs text-muted-foreground">{task.detail}</p>}
                <p className="mt-1 text-xs text-canx-green">Result: {task.result?.trim() || "Not recorded"}</p>
                <p className="mt-1 text-xs text-muted-foreground">Evidence: {task.evidence?.trim() || "Not recorded"}</p>
                {taskAssignments.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {taskAssignments.length} assignment{taskAssignments.length === 1 ? "" : "s"} recorded · latest{" "}
                    {when(taskAssignments[0]?.assigned_at)}
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
                              data: { accessToken: accessToken!, taskId: task.id, worker: worker[task.id] ?? "" },
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
                          () => cancelTask({ data: { accessToken: accessToken!, taskId: task.id, reason: "" } }),
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
                      onChange={(e) => setEditing((s) => ({ ...s, [task.id]: { ...edit, title: e.target.value } }))}
                    />
                    <Label className="text-xs" htmlFor={`edit-detail-${task.id}`}>
                      Details
                    </Label>
                    <Textarea
                      id={`edit-detail-${task.id}`}
                      value={edit.detail}
                      onChange={(e) => setEditing((s) => ({ ...s, [task.id]: { ...edit, detail: e.target.value } }))}
                    />
                    <Label className="text-xs" htmlFor={`edit-project-${task.id}`}>
                      Project
                    </Label>
                    <Input
                      id={`edit-project-${task.id}`}
                      className="h-11"
                      value={edit.project}
                      onChange={(e) => setEditing((s) => ({ ...s, [task.id]: { ...edit, project: e.target.value } }))}
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
                                risk: task.risk,
                              },
                            });
                            setEditing((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== task.id)));
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
              <Input id="new-title" className="h-11" value={title} onChange={(e) => setTitle(e.target.value)} />
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
              <Textarea id="new-detail" value={detail} onChange={(e) => setDetail(e.target.value)} />
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
