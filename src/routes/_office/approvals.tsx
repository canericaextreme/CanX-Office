import { ClaudeSpendApproval } from "@/components/office/ClaudeSpendApproval";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import { ApprovalInbox } from "@/components/office/ApprovalInbox";
import { RoomShell } from "@/components/office/RoomShell";
import { OfficeFiles } from "@/components/office/OfficeFiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useManagerMemory } from "@/lib/use-manager-memory";
import {
  decideManagerApproval,
  requestManagerApproval,
  type RiskLevel,
} from "@/lib/manager-work.functions";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

// Acid Green room palette (15 Oct 2026). Text on the bright greens is always dark ink,
// because white text on acid green is hard to read.
const APPROVALS_COLORS = {
  acid: "#B0FF1A",
  lime: "#8FDB00",
  leaf: "#5FA300",
  forest: "#2F5200",
  ink: "#132006",
  pale: "#F3FFE0",
  stone: "#4A4F44",
} as const;

const C = APPROVALS_COLORS;

const STEPS = [
  ["Send", "Write what needs approval, why, the cost and the risk."],
  ["Wait", "The request waits in the approval box until John decides."],
  ["Decide", "John approves or declines. Red-light actions are stopped before this point."],
  ["Work", "Approved items appear on the Work Board as approved work."],
] as const;

export const Route = createFileRoute("/_office/approvals")({
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
  component: Approvals,
});

function Approvals() {
  const location = useLocation();
  const { memory, loading, error, isOwner, accessToken, sessionMessage, refresh } =
    useManagerMemory();
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
          costCents:
            Number.isFinite(amount) && cost.trim() !== "" ? Math.round(amount * 100) : null,
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
        window.dispatchEvent(new CustomEvent("canx:workbench-changed"));
      }
    } catch {
      setNotice("That decision could not be saved.");
    } finally {
      setBusy(null);
    }
  };

  const durable = memory?.approvals ?? null;

  return (
    <RoomShell showFiles={false}>
      <div className="space-y-8">
        <header
          className="rounded-xl border p-6 sm:p-8"
          style={{
            borderColor: C.leaf,
            background: `linear-gradient(135deg, ${C.acid} 0%, ${C.lime} 50%, ${C.leaf} 100%)`,
            color: C.ink,
          }}
        >
          <p className="text-xs font-semibold tracking-[.2em]" style={{ color: C.forest }}>
            CANX OFFICE / ROOM 03
          </p>
          <h2 className="mt-3 font-serif text-3xl font-semibold sm:text-4xl">One decision inbox</h2>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed">
            Open a request to read what needs your decision, then choose Approve or Decline. Past
            decisions are kept separately below. Only the verified owner can decide.
          </p>
          <div
            className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-xs"
            style={{ backgroundColor: C.ink, color: C.pale }}
          >
            <span>
              {durable
                ? "Shared approval box — saved in the CanX-owned database."
                : isOwner
                  ? (error ?? "Shared approval box unavailable; no live requests can be shown.")
                  : sessionMessage}
            </span>
            {isOwner && (
              <Button
                size="sm"
                onClick={refresh}
                disabled={loading}
                className="hover:opacity-90"
                style={{ backgroundColor: C.acid, color: C.ink }}
              >
                {loading ? "Checking…" : "Refresh"}
              </Button>
            )}
          </div>
        </header>

        {notice && (
          <p role="status" aria-live="polite" className="text-sm text-canx-yellow">
            {notice}
          </p>
        )}
        {problem && <p className="text-xs text-canx-red">{problem}</p>}

        <section aria-label="Approval requests">
          <h2 className="font-serif text-2xl">Approval requests</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Each request shows what it is, what it costs, how risky it is and where it stands.
          </p>
          {durable ? (
            <div className="mt-4">
              <ApprovalInbox
                approvals={durable}
                busy={busy}
                canDecide={isOwner && !!accessToken}
                onDecide={onDecide}
                focusedId={location.hash.replace(/^#/, "")}
              />
            </div>
          ) : (
            <p role="status" className="mt-4 text-sm text-muted-foreground">
              {loading ? "Loading your approval requests…" : error || sessionMessage}
            </p>
          )}
        </section>

        {durable && (
          <section aria-label="Send something for approval">
            <article
              className="rounded-lg border bg-card p-4 sm:p-6"
              style={{ borderTop: `4px solid ${C.acid}` }}
            >
              <h2 className="font-serif text-2xl">Send something for approval</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                  <Button
                    onClick={onSubmit}
                    disabled={busy === "new"}
                    className="hover:opacity-90"
                    style={{ backgroundColor: C.acid, color: C.ink }}
                  >
                    {busy === "new" ? "Sending…" : "Send for approval"}
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Red-light actions are stopped and cannot be queued here. Approved items appear
                    on the Work Board.
                  </p>
                </div>
              </div>
            </article>
          </section>
        )}

        <section aria-label="Claude Second Eyes">
          <ClaudeSpendApproval />
        </section>

        <section aria-label="Approval files">
          <h2 className="font-serif text-2xl">Supporting files</h2>
          <p className="mt-2 mb-4 text-sm text-muted-foreground">
            Papers and photos that back up a decision.
          </p>
          <OfficeFiles room="approvals" />
        </section>

        <section>
          <h2 className="font-serif text-2xl">How an approval moves</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {STEPS.map(([stepTitle, stepDetail], i) => (
              <article
                key={stepTitle}
                className="rounded-lg border bg-card p-4"
                style={{ borderTop: `4px solid ${i % 2 ? C.leaf : C.acid}` }}
              >
                <p className="text-xs font-semibold text-muted-foreground">STEP {i + 1}</p>
                <h3 className="mt-2 font-serif text-xl">{stepTitle}</h3>
                <p className="mt-2 text-sm leading-relaxed">{stepDetail}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </RoomShell>
  );
}
