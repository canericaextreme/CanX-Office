"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { COMPANION_OPEN_EVENT } from "@/lib/companion-bridge";
import { CompanionWorkPanel, type Observation } from "@/components/office/CompanionWorkPanel";
import { useCompanionPosition } from "@/lib/companion-position";
import { CHAT_PHASE_LABEL, useRealtimeChat } from "@/lib/use-realtime-chat";

const HIDDEN_KEY = "canx.companion.hidden";

/** Friendly, professional CanX assistant face in the office's own colours. */
function AssistantFace({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className="h-10 w-10 sm:h-12 sm:w-12" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="23" className="fill-primary/15" />
      <path
        d="M12 22a12 12 0 0 1 24 0v6a12 12 0 0 1-12 12h-3"
        className="fill-none stroke-primary"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <rect x="7" y="21" width="6" height="10" rx="3" className="fill-primary" />
      <rect x="35" y="21" width="6" height="10" rx="3" className="fill-primary" />
      <circle cx="19" cy="24" r="2.2" className="fill-foreground" />
      <circle cx="29" cy="24" r="2.2" className="fill-foreground" />
      <path
        d={active ? "M18 30c2 3 10 3 12 0" : "M18 30c2 2 10 2 12 0"}
        className="fill-none stroke-foreground"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Compact CanX companion.
 *
 * Chat runs its own conversational voice session — never the Office Manager's
 * browser speech voice, and never a transcript panel. Work opens the
 * companion's own written ChatGPT Work panel inside the office page and never
 * reaches the Office Manager; the Manager opens only from its own control, or
 * from the deliberate review-before-send text draft John chooses to hand over.
 *
 * The one Office snapshot John takes with "See Office Screen" lives here in
 * memory only, alongside its room and path, so it can be handed to a voice
 * session once that connection is actually live. It is never stored and it is
 * gone on reload.
 */
export function CompanionDock() {
  const [hidden, setHidden] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const { ref, pos, dragging, onPointerDown, nudge } = useCompanionPosition();
  const chat = useRealtimeChat();
  /**
   * The latest office observation, in memory at this shared level only — never
   * storage, never a record — so it can be handed to a voice session that John
   * starts afterwards. It is gone on reload.
   */
  const observationRef = useRef<Observation | null>(null);
  const sharedRef = useRef<Observation | null>(null);

  // Chat and Work do not run at the same time, so the observation is injected
  // once the voice session is actually live.
  useEffect(() => {
    if (chat.phase !== "listening") return;
    const pending = observationRef.current;
    if (!pending || sharedRef.current === pending) return;
    if (chat.shareOfficeContext(pending)) sharedRef.current = pending;
  }, [chat]);

  useEffect(() => {
    setHidden(window.localStorage.getItem(HIDDEN_KEY) === "1");
    const reopen = () => {
      window.localStorage.removeItem(HIDDEN_KEY);
      setHidden(false);
    };
    window.addEventListener(COMPANION_OPEN_EVENT, reopen);
    return () => window.removeEventListener(COMPANION_OPEN_EVENT, reopen);
  }, []);

  const active = chat.active;
  const label = chat.error ?? CHAT_PHASE_LABEL[chat.phase];

  if (hidden) {
    return (
      <button
        type="button"
        data-testid="canx-companion-tab"
        onClick={() => {
          window.localStorage.removeItem(HIDDEN_KEY);
          setHidden(false);
        }}
        aria-label="Restore the CanX companion"
        className="fixed bottom-24 left-0 z-40 flex h-12 w-9 items-center justify-center rounded-r-xl border border-l-0 border-border bg-card/95 text-primary shadow-lg backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AssistantFace active={false} />
      </button>
    );
  }

  const closeCompanion = () => {
    chat.stop();
    setWorkOpen(false);
    window.localStorage.setItem(HIDDEN_KEY, "1");
    setHidden(true);
  };

  // Chat and Work never run together: voice stops when the Work window opens,
  // and the Work window closes when a voice conversation starts.
  const toggleWork = () => {
    if (!workOpen) chat.stop();
    setWorkOpen((open) => !open);
  };

  const toggleChat = () => {
    if (!chat.on) setWorkOpen(false);
    chat.toggle();
  };

  return (
    <>
    {workOpen && (
      <CompanionWorkPanel
        onClose={() => setWorkOpen(false)}
        onObservation={(observation) => {
          observationRef.current = observation;
          sharedRef.current = null;
        }}
        voiceNote="Voice Chat picks this observation up the next time you start Chat. It is kept in memory only and disappears if you reload."
      />
    )}
    <section
      ref={ref as React.RefObject<HTMLElement>}
      aria-label="CanX companion"
      data-canx-no-capture="true"
      data-testid="canx-companion-dock"
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 40 : 12;
        if (event.key === "ArrowLeft") { event.preventDefault(); nudge(-step, 0); }
        if (event.key === "ArrowRight") { event.preventDefault(); nudge(step, 0); }
        if (event.key === "ArrowUp") { event.preventDefault(); nudge(0, -step); }
        if (event.key === "ArrowDown") { event.preventDefault(); nudge(0, step); }
      }}
      tabIndex={0}
      title="Drag to move"
      style={pos ? { left: pos.left, top: pos.top } : { left: 16, bottom: 16 }}
      className={`fixed z-40 flex h-28 w-28 cursor-move touch-none select-none flex-col items-center justify-between rounded-2xl border border-border bg-card/95 p-2 shadow-2xl backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-32 sm:w-32 ${
        dragging ? "opacity-90" : ""
      }`}
    >
      <div data-testid="canx-companion-drag-handle" className="flex w-full items-center justify-between px-1">
        <span
          data-testid="canx-companion-status-light"
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full bg-canx-blue ${active ? "animate-pulse motion-reduce:animate-none" : ""}`}
        />
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={closeCompanion}
          aria-label="Close the CanX companion"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <AssistantFace active={active} />
      <p
        data-testid="canx-companion-status-text"
        role="status"
        aria-live="polite"
        className="w-full shrink-0 truncate px-1 text-center text-[10px] leading-tight text-muted-foreground"
        title={chat.missingSetting ? `${label} (setting needed: ${chat.missingSetting})` : label}
      >
        {label}
      </p>


      <div className="flex w-full gap-1.5">
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={toggleChat}
          aria-pressed={chat.on}
          aria-label={chat.on ? "End the CanX Chat voice conversation" : "Start a CanX Chat voice conversation"}
          className="min-h-9 flex-1 rounded-md bg-primary px-1 text-xs font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {chat.on ? "Stop" : "Chat"}
        </button>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={toggleWork}
          aria-pressed={workOpen}
          aria-label={workOpen ? "Close the ChatGPT Work window" : "Open the ChatGPT Work window"}
          className="min-h-9 flex-1 rounded-md border border-border bg-secondary px-1 text-xs font-semibold text-secondary-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Work
        </button>
      </div>
    </section>
    </>
  );
}
