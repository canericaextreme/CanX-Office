import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SAMPLE_WORK_ITEMS } from "@/lib/office-data";
import { StatusBadge } from "@/components/office/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useManagerMemory } from "@/lib/use-manager-memory";
import { createManagerTask, assignManagerTask, verifyManagerTask } from "@/lib/manager-work.functions";
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

function WorkBoard() {
  const { memory, loading, error, isOwner, accessToken, sessionMessage, refresh } = useManagerMemory();
  const createTask = useServerFn(createManagerTask);
  const assignTask = useServerFn(assignManagerTask);
  const verifyTask = useServerFn(verifyManagerTask);

  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [worker, setWorker] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const durable = memory?.tasks ?? null;

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setNotice(null);
    try {
      const res = (await fn()) as { ok?: boolean; message?: string };
      if (res && res.ok === false) setNotice(res.message ?? "That action could not be saved.");
      else {
        setNotice(done);
        refresh();
      }
    } catch {
      setNotice("That action could not be saved.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <RoomShell>
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Canonical queue</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {durable
                  ? "Shared memory — saved in the CanX-owned database."
                  : isOwner
                    ? error ?? "Shared memory unavailable; showing labelled sample items."
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
          {notice && <p className="text-xs text-canx-yellow">{notice}</p>}

          {durable
            ? durable.length === 0
              ? <p className="text-sm text-muted-foreground">No work is recorded yet.</p>
              : durable.map((task) => (
                  <div key={task.id} className="rounded-lg border border-border/50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        tone={
                          task.status === "done"
                            ? "green"
                            : task.status === "in_progress"
                              ? "blue"
                              : task.status === "cancelled"
                                ? "red"
                                : "grey"
                        }
                        label={task.status.replace("_", " ")}
                      />
                      <span className="font-medium">{task.title}</span>
                      <span className="text-xs text-muted-foreground">· risk {task.risk}</span>
                      {task.worker ? <span className="text-xs text-muted-foreground">· {task.worker}</span> : null}
                    </div>
                    {task.detail && <p className="mt-1 text-xs text-muted-foreground">{task.detail}</p>}
                    {task.result && <p className="mt-1 text-xs text-canx-green">Result: {task.result}</p>}

                    {task.status === "open" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Input
                          className="h-9 max-w-[220px]"
                          placeholder="Worker name"
                          value={worker[task.id] ?? ""}
                          onChange={(e) => setWorker((w) => ({ ...w, [task.id]: e.target.value }))}
                        />
                        <Button
                          size="sm"
                          disabled={busy === task.id || !(worker[task.id] ?? "").trim() || !accessToken}
                          onClick={() =>
                            run(
                              task.id,
                              () =>
                                assignTask({
                                  data: { accessToken: accessToken!, taskId: task.id, worker: worker[task.id] ?? "" },
                                }),
                              "Assigned.",
                            )
                          }
                        >
                          Assign
                        </Button>
                      </div>
                    )}

                    {task.status === "in_progress" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Input
                          className="h-9 max-w-[320px]"
                          placeholder="What was verified"
                          value={result[task.id] ?? ""}
                          onChange={(e) => setResult((r) => ({ ...r, [task.id]: e.target.value }))}
                        />
                        <Button
                          size="sm"
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
                                    evidence: "",
                                  },
                                }),
                              "Verified and closed.",
                            )
                          }
                        >
                          Verify done
                        </Button>
                      </div>
                    )}
                  </div>
                ))
            : SAMPLE_WORK_ITEMS.map((item) => (
                <div key={item.id} className="rounded-lg border border-border/50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={item.status} />
                    <span className="font-medium">{item.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Project: {item.project}</p>
                  {item.blocker && <p className="mt-1 text-xs text-canx-yellow">Blocker: {item.blocker}</p>}
                  {item.evidence && <p className="mt-1 text-xs text-canx-green">Evidence: {item.evidence}</p>}
                </div>
              ))}
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="mt-6 border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Add a task</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea
              placeholder="What needs doing (optional)"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
            <Button
              disabled={busy === "new" || !title.trim() || !accessToken}
              onClick={() =>
                run(
                  "new",
                  async () => {
                    const res = await createTask({ data: { accessToken: accessToken!, title, detail, risk: "green" } });
                    setTitle("");
                    setDetail("");
                    return res;
                  },
                  "Task added to the shared queue.",
                )
              }
            >
              Add task
            </Button>
          </CardContent>
        </Card>
      )}
    </RoomShell>
  );
}
