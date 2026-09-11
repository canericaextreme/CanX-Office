import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SAMPLE_APPROVALS } from "@/lib/office-data";
import { StatusBadge } from "@/components/office/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useManagerMemory, formatCents } from "@/lib/use-manager-memory";
import { decideManagerApproval, requestManagerApproval, type RiskLevel } from "@/lib/manager-work.functions";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_office/approvals")({
  head: () => ({
    meta: [
      { title: "CanX Office — Approvals Vault" },
      { name: "description", content: "Controlled approvals and authorization in CanX Office." },
      { property: "og:title", content: "CanX Office — Approvals Vault" },
      { property: "og:description", content: "Controlled approvals and authorization in CanX Office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Approvals,
});

function Approvals() {
  const { memory, loading, error, isOwner, accessToken, sessionMessage, refresh } = useManagerMemory();
  const decide = useServerFn(decideManagerApproval);
  const request = useServerFn(requestManagerApproval);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [cost, setCost] = useState("");
  const [risk, setRisk] = useState<RiskLevel>("yellow");
  const [taskId, setTaskId] = useState("");

  // Keep the box current when the Office Manager files an approval request.
  useEffect(() => {
    const onChanged = () => refresh();
    window.addEventListener("canx:workbench-changed", onChanged);
    return () => window.removeEventListener("canx:workbench-changed", onChanged);
  }, [refresh]);

  const onSubmit = async () => {
    if (!accessToken) return;
    const clean = title.trim();
    if (!clean) {
      setProblem("Give the item a short title before sending it for approval.");
      return;
    }
    const amount = Number.parseFloat(cost);
    setBusy("new");
    setNotice(null);
    setProblem(null);
    try {
      const result = await request({
        data: {
          accessToken,
          title: clean,
          detail: detail.trim(),
          costCents: Number.isFinite(amount) && cost.trim() !== "" ? Math.round(amount * 100) : null,
          risk,
          taskId: taskId || null,
        },
      });
      if ("ok" in result && result.ok === false) {
        setProblem(result.message);
      } else {
        setNotice("Sent for approval. It is now waiting in the box below.");
        setTitle("");
        setDetail("");
        setCost("");
        setTaskId("");
        refresh();
        window.dispatchEvent(new CustomEvent("canx:workbench-changed"));
      }
    } catch {
      setProblem("That request could not be saved. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  };


  const onDecide = async (approvalId: string, decision: "approved" | "declined") => {
    if (!accessToken) return;
    setBusy(approvalId);
    setNotice(null);
    try {
      const result = await decide({ data: { accessToken, approvalId, decision } });
      if ("ok" in result && result.ok === false) {
        setNotice(result.message);
      } else {
        setNotice(decision === "approved" ? "Approved and recorded." : "Declined and recorded.");
        refresh();
      }
    } catch {
      setNotice("That decision could not be saved.");
    } finally {
      setBusy(null);
    }
  };

  const durable = memory?.approvals ?? null;

  return (
    <RoomShell>
      <Card className="border-l-4 border-l-canx-red border-border bg-card">
        <CardContent className="p-4">
          <p className="text-sm text-foreground">
            Approvals are owner-controlled, time-limited, and non-transferable. MFA and session
            integrity checks are required before any approval can execute external effects.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-4 border-border bg-card">
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-xs text-muted-foreground">
          <span>
            {durable
              ? "Shared approval box — saved in the CanX-owned database."
              : isOwner
                ? error ?? "Shared approval box unavailable; showing labelled sample items."
                : sessionMessage}
          </span>
          {isOwner && (
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              {loading ? "Checking…" : "Refresh"}
            </Button>
          )}
        </CardContent>
      </Card>

      {durable && (
        <Card className="mt-4 border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Send something for approval</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="approval-title">What needs approval</Label>
              <Input
                id="approval-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short title"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="approval-detail">Details</Label>
              <Textarea
                id="approval-detail"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Why it is needed, and what happens if you approve it"
              />
            </div>
            <div>
              <Label htmlFor="approval-cost">Cost in Canadian dollars (optional)</Label>
              <Input
                id="approval-cost"
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="approval-risk">Risk</Label>
              <select
                id="approval-risk"
                value={risk}
                onChange={(e) => setRisk(e.target.value as RiskLevel)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
              >
                <option value="green">Green — routine</option>
                <option value="yellow">Yellow — needs your approval</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="approval-task">Link to an existing task (optional)</Label>
              <select
                id="approval-task"
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
              >
                <option value="">Create a new Work Board item when approved</option>
                {(memory?.tasks ?? []).map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Button onClick={onSubmit} disabled={busy === "new"}>
                {busy === "new" ? "Sending…" : "Send for approval"}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Red-light actions are stopped and cannot be queued here. Approved items appear on the
                Work Board.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {notice && <p className="mt-3 text-xs text-canx-yellow">{notice}</p>}
      {problem && <p className="mt-3 text-xs text-canx-red">{problem}</p>}


      {durable ? (
        durable.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">Nothing is waiting for your approval.</p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {durable.map((item) => (
              <Card key={item.id} className="border-border bg-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <StatusBadge
                      tone={item.status === "approved" ? "green" : item.status === "declined" ? "red" : "yellow"}
                      label={item.status}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  {item.detail && <p className="text-foreground">{item.detail}</p>}
                  <p>Cost: {formatCents(item.cost_cents)}</p>
                  <p>Risk: {item.risk}</p>
                  <p>Requested: {new Date(item.created_at).toLocaleString()}</p>
                  {item.status === "pending" && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" disabled={busy === item.id} onClick={() => onDecide(item.id, "approved")}>
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === item.id}
                        onClick={() => onDecide(item.id, "declined")}
                      >
                        Decline
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SAMPLE_APPROVALS.map((item) => (
            <Card key={item.id} className="border-border bg-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{item.action}</CardTitle>
                  <StatusBadge tone={item.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>Cost: {item.cost}</p>
                <p>Risk: {item.risk}</p>
                <p>Requested: {item.requestedAt}</p>
                <Button className="mt-3" disabled>
                  Review
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </RoomShell>
  );
}
