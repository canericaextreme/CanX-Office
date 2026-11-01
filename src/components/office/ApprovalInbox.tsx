import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { ManagerApproval } from "@/lib/manager-work.functions";
import { formatCents } from "@/lib/use-manager-memory";

const approvalAnchor = (id: string) => `approval-${id}`;

/** Display/navigation only. Decisions still use the existing owner-checked server action. */
export function ApprovalInbox({
  approvals,
  busy,
  canDecide,
  onDecide,
  focusedId,
}: {
  approvals: ManagerApproval[];
  busy: string | null;
  canDecide: boolean;
  onDecide: (id: string, decision: "approved" | "declined") => Promise<void>;
  focusedId?: string;
}) {
  const [opened, setOpened] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const handledFocus = useRef<string | null>(null);
  const pending = approvals.filter((item) => item.status === "pending");
  const history = approvals.filter((item) => item.status !== "pending");

  useEffect(() => {
    if (!focusedId) {
      handledFocus.current = null;
      return;
    }
    if (handledFocus.current === focusedId) return;
    const item = approvals.find((item) => approvalAnchor(item.id) === focusedId);
    if (!item) return;
    handledFocus.current = focusedId;
    setOpened(item.id);
    if (item.status !== "pending") setShowHistory(true);
  }, [focusedId, approvals]);

  useEffect(() => {
    const item = approvals.find((item) => item.id === opened);
    if (item && item.status !== "pending") setShowHistory(true);
  }, [opened, approvals]);

  useEffect(() => {
    if (!opened || approvalAnchor(opened) !== focusedId) return;
    const element = document.getElementById(approvalAnchor(opened));
    element?.scrollIntoView?.({ block: "nearest" });
    element?.focus();
  }, [focusedId, opened, showHistory]);

  const card = (item: ManagerApproval) => {
    const expanded = opened === item.id;
    return (
      <article
        key={item.id}
        id={approvalAnchor(item.id)}
        tabIndex={-1}
        className="min-w-0 scroll-mt-24 rounded-lg border border-lime-700 bg-[#F3FFE0] p-4 text-[#132006]"
      >
        <p className="text-xs font-bold uppercase tracking-wide">
          {item.status === "pending" ? "John — review needed" : `Past decision — ${item.status}`}
        </p>
        <h4 className="mt-2 break-words font-serif text-xl font-semibold">{item.title}</h4>
        <p className="mt-2 text-sm">
          Cost: {formatCents(item.cost_cents)} · Risk: {item.risk}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-3 min-h-11 w-full whitespace-normal border-[#132006] bg-transparent text-[#132006] hover:bg-black/10"
          aria-expanded={expanded}
          aria-controls={`${approvalAnchor(item.id)}-details`}
          aria-label={`${expanded ? "Close" : "Open"} details: ${item.title}`}
          onClick={() => setOpened(expanded ? null : item.id)}
        >
          {expanded ? "Close details" : "Open details"}
        </Button>
        {expanded && (
          <div id={`${approvalAnchor(item.id)}-details`} className="mt-4 space-y-4">
            <div>
              <h5 className="font-semibold">What you are deciding</h5>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
                {item.detail?.trim() ||
                  "No explanation was saved. Ask Elsie for the reason and what approval would allow before deciding."}
              </p>
            </div>
            <p className="text-xs">Requested: {new Date(item.created_at).toLocaleString()}</p>
            {item.task_id && (
              <Button
                asChild
                variant="outline"
                className="min-h-11 w-full border-[#132006] bg-transparent text-[#132006]"
              >
                <Link to="/work-board">Open Work Board</Link>
              </Button>
            )}
            {item.status === "pending" ? (
              <>
                {!canDecide && (
                  <p role="status" className="text-sm">
                    Owner sign-in with two-step verification is required to decide.
                  </p>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    className="min-h-11 bg-[#132006] text-[#B0FF1A] hover:bg-[#2F5200]"
                    disabled={!canDecide || busy !== null}
                    onClick={() => void onDecide(item.id, "approved")}
                  >
                    {busy === item.id ? "Saving decision…" : "Approve"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 border-[#132006] bg-transparent text-[#132006] hover:bg-black/10"
                    disabled={!canDecide || busy !== null}
                    onClick={() => void onDecide(item.id, "declined")}
                  >
                    Decline
                  </Button>
                </div>
                <p className="text-xs">
                  Your decision is recorded here. Opening details does not approve anything.
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold">
                Decision recorded: {item.status}. This item is no longer waiting for you.
              </p>
            )}
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="space-y-6">
      <section aria-label="Needs your decision" className="space-y-4">
        <h3 className="font-serif text-xl">Needs your decision ({pending.length})</h3>
        {pending.length ? (
          <div className="grid gap-4 lg:grid-cols-2">{pending.map(card)}</div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing is waiting for your approval. Previous decisions are below.
          </p>
        )}
      </section>
      <section aria-label="Past decisions" className="space-y-4">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 whitespace-normal"
          aria-expanded={showHistory}
          aria-controls="approval-history"
          onClick={() => setShowHistory((value) => !value)}
        >
          {showHistory ? "Hide" : "Show"} past decisions ({history.length})
        </Button>
        {showHistory && (
          <div id="approval-history" className="grid gap-4 lg:grid-cols-2">
            {history.length ? (
              history.map(card)
            ) : (
              <p className="text-sm text-muted-foreground">No past decisions are recorded.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
