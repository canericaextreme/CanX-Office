"use client";

/**
 * ChatGPT Work — the companion's OWN written work window.
 *
 * It lives inside the CanX Office page (never an external tab or an embedded page) and is
 * completely separate from the Office Manager: no Manager events, tasks,
 * workbench state or spending guard. It cannot change office records.
 *
 * "See Office Screen" takes ONE snapshot of the CanX Office view John is
 * looking at — never a camera, never the whole screen, never another tab — and
 * only when he presses the button. It is not a live feed: he presses it again
 * when the screen has changed. The picture is held in memory alone and is
 * never stored, logged, or handed to the Office Manager.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, Eye, Mic, Minus, Send as SendIcon, X } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useOwnerSession } from "@/lib/owner-session";
import { askCompanionWork } from "@/lib/companion-work.functions";
import { observeOfficeView } from "@/lib/office-observe.functions";
import { captureOfficeView, managerDraft } from "@/lib/office-observe";
import {
  buildWorkHandoffDraft,
  HANDOFF_SOURCE_LABEL,
  HANDOFF_STATUS_EVENT,
  HANDOFF_STATUS_LABEL,
  newHandoffId,
  sendManagerHandoff,
  type HandoffReceipt,
} from "@/lib/companion-bridge";
import { submitCompanionDecision } from "@/lib/companion-decision.functions";
import {
  buildDecisionDraft,
  COMPANION_INFLIGHT_KEY,
  COMPANION_THREAD_KEY,
  loadLocal,
  saveLocal,
  type DecisionDraft,
} from "@/lib/companion-decision";
import type { CompanionContextStatus } from "@/lib/companion-work.functions";
import { WORKER_SEATS } from "@/lib/manager-workers";
import { DecisionTracker, DECISIONS_CHANGED_EVENT } from "@/components/office/DecisionTracker";

export type WorkState = "Ready" | "Working" | "Observing" | "Completed" | "Error";

interface WorkTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface Observation {
  text: string;
  room: string;
  path: string;
  /** The bounded, already-redacted snapshot. Memory only, never persisted. */
  voiceImage?: string;
}

export function CompanionWorkPanel({
  onClose,
  onObservation,
  onTalkAboutScreen,
  voiceNote,
}: {
  onClose: () => void;
  /** Hands the latest sanitized observation up to the companion (memory only). */
  onObservation?: (observation: Observation | null) => void;
  /** Closes Work and starts the separate voice Chat with this snapshot ready. */
  onTalkAboutScreen?: (observation: Observation) => void;
  /** Honest one-line note about voice context, shown under the card. */
  voiceNote?: string;
}) {
  const { state: ownerState, accessToken } = useOwnerSession();
  const ask = useServerFn(askCompanionWork);
  const submitDecision = useServerFn(submitCompanionDecision);
  const observe = useServerFn(observeOfficeView);
  const path = useRouterState({ select: (s) => s.location.pathname });

  const [minimized, setMinimized] = useState(false);
  const [turns, setTurns] = useState<WorkTurn[]>([]);
  const [input, setInput] = useState("");
  const [work, setWork] = useState<WorkState>("Ready");
  const [error, setError] = useState<string | null>(null);
  const [observation, setObservation] = useState<Observation | null>(null);
  const [handedOff, setHandedOff] = useState(false);
  /** Editable review draft for ONE selected exchange; nothing leaves until John presses. */
  const [review, setReview] = useState<{ text: string; turnId: string } | null>(null);
  /** Receipts for handoffs made from this window, keyed by handoff id. Memory only. */
  const [receipts, setReceipts] = useState<Record<string, HandoffReceipt>>({});
  /** Tracked decision being reviewed. Its correlation id stays the same across retries. */
  const [decision, setDecision] = useState<DecisionDraft | null>(null);
  const [sending, setSending] = useState(false);
  const [decisionNote, setDecisionNote] = useState<string | null>(null);
  const [context, setContext] = useState<CompanionContextStatus | null>(null);
  const [storageNote, setStorageNote] = useState<string | null>(null);
  const restoredRef = useRef(false);

  // Continuity after interruption: this device only, clearly labelled.
  useEffect(() => {
    const saved = loadLocal<WorkTurn[]>(COMPANION_THREAD_KEY);
    if (Array.isArray(saved)) setTurns(saved.filter((t) => t && (t.role === "user" || t.role === "assistant")).slice(-40));
    const inflight = loadLocal<DecisionDraft>(COMPANION_INFLIGHT_KEY);
    if (inflight?.correlationId) {
      setDecision(inflight);
      setDecisionNote("A request from before the reload was not confirmed. Press Send to Astra — it checks for a saved copy first.");
    }
    restoredRef.current = true;
  }, []);
  useEffect(() => {
    if (!restoredRef.current) return;
    setStorageNote(saveLocal(COMPANION_THREAD_KEY, turns.slice(-40)) ? null : "This discussion could not be saved on this device; it will be lost on reload.");
  }, [turns]);

  const sendDecision = async () => {
    if (!decision || sending || !decision.request.trim()) return;
    if (!requireSession()) return;
    setSending(true);
    setDecisionNote(null);
    saveLocal(COMPANION_INFLIGHT_KEY, decision);
    const res = await submitDecision({ data: { accessToken: accessToken!, ...decision } }).catch(() => null);
    setSending(false);
    if (!res) {
      setDecisionNote("No confirmation came back. Nothing is shown as saved. Press Send again — it checks the same request id first, so no duplicate is made.");
      return;
    }
    if (!res.ok) {
      setDecisionNote(res.message);
      if (res.code === "invalid_input") saveLocal(COMPANION_INFLIGHT_KEY, null);
      return;
    }
    saveLocal(COMPANION_INFLIGHT_KEY, null);
    setDecision(null);
    setDecisionNote(`Task ${res.status.taskId.slice(0, 8)} saved and read back. ${res.assignmentNote}`);
    window.dispatchEvent(new Event(DECISIONS_CHANGED_EVENT));
  };
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, work, observation, review]);

  useEffect(() => {
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<HandoffReceipt>).detail;
      if (!detail?.id) return;
      setReceipts((current) => (current[detail.id] ? { ...current, [detail.id]: detail } : current));
    };
    window.addEventListener(HANDOFF_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(HANDOFF_STATUS_EVENT, onStatus);
  }, []);

  const trackHandoff = (id: string) =>
    setReceipts((current) => ({
      ...current,
      [id]: { id, status: "drafted", detail: "Placed in Astra's panel for your review.", at: new Date().toISOString() },
    }));

  const handToAstra = () => {
    if (!review || !review.text.trim()) return;
    const id = newHandoffId();
    trackHandoff(id);
    sendManagerHandoff({ id, source: "work_discussion", text: review.text.trim().slice(0, 4000), room: "", path });
    setReview(null);
  };

  const requireSession = () => {
    if (ownerState === "signed_out" || !accessToken) {
      setWork("Error");
      setError("Sign in to the CanX Office to use the CanX Office companion.");
      return false;
    }
    return true;
  };

  const send = async () => {
    const text = input.trim();
    if (!text || work === "Working" || work === "Observing") return;
    if (!requireSession()) return;
    const next = [...turns, { id: `u-${Date.now()}`, role: "user" as const, content: text }];
    setTurns(next);
    setInput("");
    setError(null);
    setWork("Working");

    const reply = await ask({
      data: { accessToken: accessToken!, messages: next.map(({ role, content }) => ({ role, content })) },
    }).catch(() => null);

    if (reply?.context) setContext(reply.context);
    if (!reply || !reply.ok || !reply.text) {
      setWork("Error");
      setError(reply?.detail ?? "The CanX Office companion could not answer just now.");
      return;
    }
    setTurns((current) => [...current, { id: `a-${Date.now()}`, role: "assistant", content: reply.text }]);
    setWork("Completed");
  };

  /** Runs only from John's explicit press. One snapshot, then it stops. */
  const runObserve = async () => {
    if (work === "Working" || work === "Observing") return;
    if (!requireSession()) return;
    setError(null);
    setHandedOff(false);
    // Clear the previous snapshot first, so a failed fresh look can never be
    // mistaken for the screen John is looking at now.
    setObservation(null);
    onObservation?.(null);
    setWork("Observing");

    const captured = await captureOfficeView(path);
    if (!captured.ok) {
      setWork("Error");
      setError(captured.message);
      return;
    }

    const reply = await observe({
      data: { accessToken: accessToken!, ...captured.observation },
    }).catch(() => null);

    if (!reply || !reply.ok || !reply.text) {
      setWork("Error");
      setError(reply?.detail ?? "The office view could not be observed just now.");
      return;
    }
    const result: Observation = {
      text: reply.text,
      room: reply.room,
      path: reply.path,
      // The picture itself stays in memory here and travels only to the live
      // voice conversation. It is never stored and never given to the Manager.
      voiceImage: captured.observation.voiceImage,
    };
    setObservation(result);
    onObservation?.(result);
    setWork("Completed");
  };

  const stateTone =
    work === "Error"
      ? "bg-canx-red/15 text-canx-red"
      : work === "Working" || work === "Observing"
        ? "bg-canx-yellow/20 text-foreground"
        : "bg-canx-blue/15 text-foreground";

  const busy = work === "Working" || work === "Observing";

  return (
    <section
      data-testid="canx-work-panel"
      data-canx-no-capture="true"
      aria-label="CanX Office companion (OpenAI)"
      className={`fixed bottom-4 right-4 z-50 flex w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl ${
        minimized ? "" : "max-h-[min(34rem,calc(100vh-6rem))]"
      }`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border bg-secondary px-3 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">CanX Office companion (OpenAI)</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            Not your external ChatGPT — no ChatGPT history, memory or connectors.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span data-testid="canx-work-state" className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${stateTone}`}>
            {work}
          </span>
          <button
            type="button"
            onClick={() => setMinimized((v) => !v)}
            aria-label={minimized ? "Expand the Office Work assistant window" : "Minimize the Office Work assistant window"}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the Office Work assistant window"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {!minimized && (
        <>
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <button
              type="button"
              data-testid="canx-observe-button"
              onClick={() => void runObserve()}
              disabled={busy}
              aria-label="See Office Screen — take one protected snapshot of this CanX Office page"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              See Office Screen
            </button>
            <p className="text-[11px] leading-tight text-muted-foreground">
              One snapshot of this office page — not a live feed. Press it again when the screen changes. No camera, no
              screen sharing, nothing saved.
            </p>
          </div>

          <p data-testid="canx-companion-context" className="border-b border-border px-3 py-1 text-[11px] text-muted-foreground">
            {context === null
              ? "Shared CanX context: not loaded yet — it is read from your protected office records with each answer."
              : context.loaded
                ? `Shared CanX context loaded from ${context.sources.join(" + ")} at ${new Date(context.readAt).toLocaleTimeString()}.${context.detail ? ` ${context.detail}` : ""}`
                : `Shared CanX context NOT loaded (${new Date(context.readAt).toLocaleTimeString()}): ${context.detail}`}
            {" "}Discussion kept on this device only.{storageNote ? ` ${storageNote}` : ""}
          </p>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {turns.length === 0 && !observation && (
              <p className="text-sm text-muted-foreground">
                Talk a decision through here. When ready, press "Send to Astra…" under your message to create one tracked task. This window cannot change office records itself.
              </p>
            )}
            {turns.map((turn, index) => (
              <div key={turn.id} className={turn.role === "user" ? "flex flex-col items-end gap-1" : ""}>
                <div
                  className={
                    turn.role === "user"
                      ? "max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "max-w-full whitespace-pre-wrap text-sm text-foreground"
                  }
                >
                  {turn.content}
                </div>
                {turn.role === "user" && (
                  <button
                    type="button"
                    data-testid="canx-work-handoff-select"
                    onClick={() => {
                      const draft = buildDecisionDraft(turns, index, newHandoffId());
                      if (draft) {
                        setDecision(draft);
                        setDecisionNote(null);
                        setReview(null);
                      }
                    }}
                    className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    Send to Astra…
                  </button>
                )}
              </div>
            ))}

            {decision && (
              <article
                data-testid="canx-decision-review"
                aria-label="Review the tracked request to Astra"
                className="rounded-lg border border-canx-yellow/50 bg-canx-yellow/5 p-3 text-xs"
              >
                <h3 className="font-semibold uppercase tracking-wide text-muted-foreground">Tracked request to Astra</h3>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Source: {decision.source}. Ref {decision.correlationId}. Edit anything before sending.
                </p>
                <label className="mt-2 block font-semibold" htmlFor="canx-decision-request">Request / decision</label>
                <textarea
                  id="canx-decision-request"
                  data-testid="canx-decision-request"
                  value={decision.request}
                  onChange={(e) => setDecision({ ...decision, request: e.target.value.slice(0, 800) })}
                  rows={3}
                  className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <label className="mt-2 block font-semibold" htmlFor="canx-decision-outcome">Outcome expected</label>
                <textarea
                  id="canx-decision-outcome"
                  value={decision.outcome}
                  onChange={(e) => setDecision({ ...decision, outcome: e.target.value.slice(0, 500) })}
                  rows={2}
                  className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <label className="mt-2 block font-semibold" htmlFor="canx-decision-worker">Room worker (suggested)</label>
                <select
                  id="canx-decision-worker"
                  value={decision.workerId}
                  onChange={(e) => setDecision({ ...decision, workerId: e.target.value })}
                  className="mt-1 min-h-9 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
                >
                  {WORKER_SEATS.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} — {s.role}</option>
                  ))}
                  <option value="">Leave unassigned</option>
                </select>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid="canx-decision-send"
                    onClick={() => void sendDecision()}
                    disabled={sending || !decision.request.trim()}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <SendIcon className="h-4 w-4" aria-hidden="true" />
                    {sending ? "Sending…" : "Send to Astra"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const idx = turns.findIndex((t) => t.role === "user" && t.content.includes(decision.request.slice(0, 40)));
                      const text = idx >= 0 ? buildWorkHandoffDraft(turns, idx) : null;
                      setReview({ text: text ?? decision.request, turnId: "" });
                      setDecision(null);
                      saveLocal(COMPANION_INFLIGHT_KEY, null);
                    }}
                    className="inline-flex min-h-9 items-center rounded-md border border-border px-3 font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Discuss in Astra's panel instead
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDecision(null);
                      saveLocal(COMPANION_INFLIGHT_KEY, null);
                    }}
                    className="inline-flex min-h-9 items-center rounded-md border border-border px-3 font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Cancel
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Send saves one task in your office records (checked by reading it back) and assigns it to the chosen worker. The worker does not answer until you press Ask. Nothing is marked done.
                </p>
              </article>
            )}
            {decisionNote && (
              <p role="status" data-testid="canx-decision-note" className="rounded-md border border-border px-2 py-1 text-[11px] text-foreground">
                {decisionNote}
              </p>
            )}
            <DecisionTracker accessToken={accessToken ?? null} compact />

            {review && (
              <article
                data-testid="canx-work-handoff-review"
                aria-label="Review the handoff to Astra"
                className="rounded-lg border border-canx-yellow/50 bg-canx-yellow/5 p-3"
              >
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Review before handing to Astra
                </h3>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Source: {HANDOFF_SOURCE_LABEL.work_discussion}. Only this one request and the reply after it are
                  included — no pictures, no whole chat, secrets removed. Edit freely.
                </p>
                <label className="sr-only" htmlFor="canx-work-handoff-text">Handoff draft</label>
                <textarea
                  id="canx-work-handoff-text"
                  data-testid="canx-work-handoff-text"
                  value={review.text}
                  onChange={(event) => setReview({ ...review, text: event.target.value.slice(0, 4000) })}
                  rows={6}
                  className="mt-2 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid="canx-work-handoff-confirm"
                    onClick={handToAstra}
                    disabled={!review.text.trim()}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <SendIcon className="h-4 w-4" aria-hidden="true" />
                    Place draft in Astra's panel
                  </button>
                  <button
                    type="button"
                    onClick={() => setReview(null)}
                    className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Cancel
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  This only places a draft. Astra does nothing until you press Send in her panel.
                </p>
              </article>
            )}

            {Object.values(receipts).length > 0 && (
              <ul data-testid="canx-work-handoff-receipts" aria-label="Handoff receipts" className="space-y-1">
                {Object.values(receipts).map((r) => (
                  <li key={r.id} className="rounded-md border border-border px-2 py-1 text-[11px] text-foreground">
                    <span className="font-semibold">{HANDOFF_STATUS_LABEL[r.status]}</span> — {r.detail}{" "}
                    <span className="text-muted-foreground">({new Date(r.at).toLocaleTimeString()})</span>
                  </li>
                ))}
              </ul>
            )}

            {observation && (
              <article
                data-testid="canx-observation-card"
                aria-label="Office observation"
                className="rounded-lg border border-canx-blue/40 bg-canx-blue/5 p-3"
              >
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Office observation — {observation.room}
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{observation.text}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid="canx-talk-about-screen"
                    onClick={() => onTalkAboutScreen?.(observation)}
                    aria-label="Talk with ChatGPT about this screen — closes this window and starts voice Chat"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-secondary px-3 text-xs font-semibold text-secondary-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Mic className="h-4 w-4" aria-hidden="true" />
                    Talk with ChatGPT about this screen
                  </button>
                  <button
                    type="button"
                    data-testid="canx-send-to-manager"
                    onClick={() => {
                      const id = newHandoffId();
                      trackHandoff(id);
                      sendManagerHandoff({
                        id,
                        source: "screen_observation",
                        text: managerDraft(observation.room, observation.path, observation.text),
                        room: observation.room,
                        path: observation.path,
                      });
                      setHandedOff(true);
                    }}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <SendIcon className="h-4 w-4" aria-hidden="true" />
                    Send to Manager
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Talking closes this window and starts voice Chat, then hands this one snapshot to it. The Office
                  Manager is never involved in that.
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {handedOff
                    ? "Draft placed in the Office Manager for you to review. Nothing was sent or saved."
                    : "This snapshot is held in memory only and disappears if you reload. Sending puts a text-only draft in the Office Manager for you to review — nothing is sent or saved, and the picture never goes to the Manager."}
                </p>
                {voiceNote && <p className="mt-1 text-[11px] text-muted-foreground">{voiceNote}</p>}
              </article>
            )}

            {busy && (
              <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
                {work === "Observing" ? "Observing this office page…" : "Working…"}
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-md border border-canx-red/40 bg-canx-red/10 px-3 py-2 text-sm text-foreground">
                {error}
              </p>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="flex items-end gap-2 border-t border-border p-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label className="sr-only" htmlFor="canx-work-input">
              Message the Office Work assistant
            </label>
            <textarea
              id="canx-work-input"
              data-testid="canx-work-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={2}
              placeholder="What should I think through?"
              className="min-h-[44px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              disabled={busy || input.trim().length === 0}
              className="min-h-[44px] rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Send
            </button>
          </form>
        </>
      )}
    </section>
  );
}
