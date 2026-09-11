"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  COMPANION_OPEN_EVENT,
  COMPANION_STATE_EVENT,
  IDLE_MANAGER_VOICE_STATE,
  isVoiceActive,
  managerVoiceLabel,
  requestCompanionChat,
  requestCompanionWork,
  type ManagerVoiceState,
} from "@/lib/companion-bridge";
import { useCompanionPosition } from "@/lib/companion-position";

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
 * Compact CanX companion. It drives the existing Office Manager voice and work
 * panel through events; it has no voice engine of its own, shows no transcript,
 * and never opens an external window.
 */
export function CompanionDock() {
  const [hidden, setHidden] = useState(false);
  const [voice, setVoice] = useState<ManagerVoiceState>(IDLE_MANAGER_VOICE_STATE);
  const { ref, pos, dragging, onPointerDown, nudge } = useCompanionPosition();

  useEffect(() => {
    setHidden(window.localStorage.getItem(HIDDEN_KEY) === "1");
    const reopen = () => {
      window.localStorage.removeItem(HIDDEN_KEY);
      setHidden(false);
    };
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<ManagerVoiceState>).detail;
      if (detail) setVoice(detail);
    };
    window.addEventListener(COMPANION_OPEN_EVENT, reopen);
    window.addEventListener(COMPANION_STATE_EVENT, onState);
    return () => {
      window.removeEventListener(COMPANION_OPEN_EVENT, reopen);
      window.removeEventListener(COMPANION_STATE_EVENT, onState);
    };
  }, []);

  const active = isVoiceActive(voice);
  const label = managerVoiceLabel(voice);

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
    if (voice.voiceMode || active) requestCompanionChat(); // stops listening and speaking
    window.localStorage.setItem(HIDDEN_KEY, "1");
    setHidden(true);
  };

  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      aria-label="CanX companion"
      data-testid="canx-companion-dock"
      style={pos ? { left: pos.left, top: pos.top } : { left: 16, bottom: 16 }}
      className={`fixed z-40 flex h-28 w-28 flex-col items-center justify-between rounded-2xl border border-border bg-card/95 p-2 shadow-2xl backdrop-blur sm:h-32 sm:w-32 ${
        dragging ? "opacity-90" : ""
      }`}
    >
      <div
        data-testid="canx-companion-drag-handle"
        onPointerDown={onPointerDown}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 40 : 12;
          if (event.key === "ArrowLeft") { event.preventDefault(); nudge(-step, 0); }
          if (event.key === "ArrowRight") { event.preventDefault(); nudge(step, 0); }
          if (event.key === "ArrowUp") { event.preventDefault(); nudge(0, -step); }
          if (event.key === "ArrowDown") { event.preventDefault(); nudge(0, step); }
        }}
        role="button"
        tabIndex={0}
        aria-label="Move the CanX companion. Use the arrow keys to move it."
        title="Drag to move"
        className="flex w-full cursor-move touch-none select-none items-center justify-between rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
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
      <span role="status" aria-live="polite" className="sr-only">
        {label}
      </span>

      <div className="flex w-full gap-1.5">
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={requestCompanionChat}
          aria-pressed={voice.voiceMode}
          aria-label={
            voice.voiceMode
              ? "Stop the Office Manager voice conversation"
              : "Start the Office Manager voice conversation"
          }
          className="min-h-9 flex-1 rounded-md bg-primary px-1 text-xs font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {voice.voiceMode ? "Stop" : "Chat"}
        </button>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={requestCompanionWork}
          aria-label="Show the Office Manager work and progress panel"
          className="min-h-9 flex-1 rounded-md border border-border bg-secondary px-1 text-xs font-semibold text-secondary-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Work
        </button>
      </div>
      {voice.error && (
        <p className="w-full truncate text-center text-[10px] text-muted-foreground" title={voice.error}>
          {voice.error}
        </p>
      )}
    </section>
  );
}
