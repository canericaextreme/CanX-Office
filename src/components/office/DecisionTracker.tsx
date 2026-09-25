"use client";

/**
 * Tracked companion → Astra requests, read from the owner's manager_tasks.
 * The SAME list (task id, stage, worker, real result/evidence) is shown in the
 * companion window and in Astra's panel. It survives reload because it is
 * read from the office records, not from window events.
 */

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { askCompanionDecisionWorker, listCompanionDecisions } from "@/lib/companion-decision.functions";
import { DECISION_STAGE_LABEL, type DecisionStatus } from "@/lib/companion-decision";

export const DECISIONS_CHANGED_EVENT = "canx:companion-decisions-changed";

export function DecisionTracker({ accessToken, compact = false }: { accessToken: string | null; compact?: boolean }) {
  const list = useServerFn(listCompanionDecisions);
  const askWorker = useServerFn(askCompanionDecisionWorker);
  const [items, setItems] = useState<DecisionStatus[] | null>(null);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setNote("Sign in as the owner to see tracked requests.");
      return;
    }
    const res = await list({ data: { accessToken } }).catch(() => null);
    if (!res || !res.ok) {
      setNote(res?.message ?? "Tracked requests could not be read just now.");
      return;
    }
    setItems(res.items);
    setReadAt(res.readAt);
    setNote(null);
  }, [accessToken, list]);

  useEffect(() => {
    void refresh();
    const on = () => void refresh();
    window.addEventListener(DECISIONS_CHANGED_EVENT, on);
    return () => window.removeEventListener(DECISIONS_CHANGED_EVENT, on);
  }, [refresh]);

  const ask = async (taskId: string) => {
    if (!accessToken || asking) return;
    setAsking(taskId);
    const res = await askWorker({ data: { accessToken, taskId } }).catch(() => null);
    setAsking(null);
    setNote(res ? (res.ok ? res.assignmentNote : res.message) : "The worker request could not be confirmed. Refresh before asking again.");
    window.dispatchEvent(new Event(DECISIONS_CHANGED_EVENT));
  };

  const shown = (items ?? []).slice(0, compact ? 3 : 8);

  return (
    <section data-testid="canx-decision-tracker" aria-label="Tracked requests to Astra" className="rounded-lg border border-border p-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tracked requests to Astra</h3>
        <button
          type="button"
          onClick={() => void refresh()}
          aria-label="Refresh tracked requests"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
      {readAt && (
        <p className="text-[11px] text-muted-foreground">Read from office records {new Date(readAt).toLocaleTimeString()}.</p>
      )}
      {items && items.length === 0 && <p className="mt-1 text-xs text-muted-foreground">No tracked requests yet.</p>}
      <ul className="mt-1 space-y-2">
        {shown.map((d) => (
          <li key={d.taskId} data-testid="canx-decision-item" className="rounded-md border border-border px-2 py-1.5 text-xs text-foreground">
            <p className="font-semibold">{d.title}</p>
            <p className="text-[11px] text-muted-foreground">
              Task {d.taskId.slice(0, 8)} · ref {d.correlationId} · {DECISION_STAGE_LABEL[d.stage]}
              {d.worker ? ` · ${d.worker}` : ""}
            </p>
            {d.result && <p className="mt-1 whitespace-pre-wrap">Result: {d.result}</p>}
            {d.evidence && <p className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">{d.evidence}</p>}
            {d.stage === "assigned" && (
              <button
                type="button"
                onClick={() => void ask(d.taskId)}
                disabled={asking !== null}
                className="mt-1 inline-flex min-h-8 items-center rounded-md border border-border px-2 text-[11px] font-semibold hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {asking === d.taskId ? "Asking…" : `Ask ${d.worker} now (uses the AI budget)`}
              </button>
            )}
          </li>
        ))}
      </ul>
      {note && <p role="status" className="mt-1 text-[11px] text-foreground">{note}</p>}
    </section>
  );
}
