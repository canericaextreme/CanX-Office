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
import { Eye, Minus, Send as SendIcon, X } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useOwnerSession } from "@/lib/owner-session";
import { askCompanionWork } from "@/lib/companion-work.functions";
import { observeOfficeView } from "@/lib/office-observe.functions";
import { captureOfficeView, managerDraft } from "@/lib/office-observe";
import { sendManagerHandoff } from "@/lib/companion-bridge";

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
  const observe = useServerFn(observeOfficeView);
  const path = useRouterState({ select: (s) => s.location.pathname });

  const [minimized, setMinimized] = useState(false);
  const [turns, setTurns] = useState<WorkTurn[]>([]);
  const [input, setInput] = useState("");
  const [work, setWork] = useState<WorkState>("Ready");
  const [error, setError] = useState<string | null>(null);
  const [observation, setObservation] = useState<Observation | null>(null);
  const [handedOff, setHandedOff] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, work, observation]);

  const requireSession = () => {
    if (ownerState === "signed_out" || !accessToken) {
      setWork("Error");
      setError("Sign in to the CanX Office to use ChatGPT Work.");
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

    if (!reply || !reply.ok || !reply.text) {
      setWork("Error");
      setError(reply?.detail ?? "ChatGPT Work could not answer just now.");
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
      aria-label="ChatGPT Work"
      className={`fixed bottom-4 right-4 z-50 flex w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl ${
        minimized ? "" : "max-h-[min(34rem,calc(100vh-6rem))]"
      }`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border bg-secondary px-3 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">ChatGPT Work</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            Thinking and drafting only — separate from the Office Manager.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span data-testid="canx-work-state" className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${stateTone}`}>
            {work}
          </span>
          <button
            type="button"
            onClick={() => setMinimized((v) => !v)}
            aria-label={minimized ? "Expand the ChatGPT Work window" : "Minimize the ChatGPT Work window"}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the ChatGPT Work window"
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

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {turns.length === 0 && !observation && (
              <p className="text-sm text-muted-foreground">
                Ask for thinking, drafting, analysis or wording. This window cannot read or change office records.
              </p>
            )}
            {turns.map((turn) => (
              <div key={turn.id} className={turn.role === "user" ? "flex justify-end" : ""}>
                <div
                  className={
                    turn.role === "user"
                      ? "max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "max-w-full whitespace-pre-wrap text-sm text-foreground"
                  }
                >
                  {turn.content}
                </div>
              </div>
            ))}

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
                      sendManagerHandoff({
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
              Message ChatGPT Work
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
