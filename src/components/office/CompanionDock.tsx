"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { COMPANION_OPEN_EVENT, openChatGptFromBrowser } from "@/lib/chatgpt-popup";

const STORAGE_KEY = "canx.companion.hidden";

/**
 * Compact CanX companion launcher.
 *
 * This is the office's own small control. It cannot read, drive, or change the
 * external ChatGPT page (cross-origin), so it shows no conversation text and claims no
 * live state. The blue dot means the launcher is ready.
 */
export function CompanionDock() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setVisible(window.localStorage.getItem(STORAGE_KEY) !== "1");
    const reopen = () => {
      window.localStorage.removeItem(STORAGE_KEY);
      setVisible(true);
    };
    window.addEventListener(COMPANION_OPEN_EVENT, reopen);
    return () => window.removeEventListener(COMPANION_OPEN_EVENT, reopen);
  }, []);

  if (!visible) return null;

  const hide = () => {
    setVisible(false);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, "1");
  };

  return (
    <section
      aria-label="CanX ChatGPT companion"
      data-testid="canx-companion-dock"
      className="fixed bottom-4 left-4 z-40 flex h-28 w-28 flex-col items-center justify-between rounded-2xl border border-border bg-card/95 p-2 shadow-2xl backdrop-blur sm:h-32 sm:w-32"
    >
      <div className="flex w-full items-start justify-end">
        <button
          type="button"
          onClick={hide}
          aria-label="Close the CanX ChatGPT companion"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex w-full gap-1.5">
        <button
          type="button"
          onClick={() => openChatGptFromBrowser("chat")}
          aria-label="Open a quick ChatGPT chat window beside the office"
          className="min-h-9 flex-1 rounded-md bg-primary px-1 text-xs font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Chat
        </button>
        <button
          type="button"
          onClick={() => openChatGptFromBrowser("work")}
          aria-label="Open a larger ChatGPT work window for a substantial task"
          className="min-h-9 flex-1 rounded-md border border-border bg-secondary px-1 text-xs font-semibold text-secondary-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Work
        </button>
      </div>
    </section>
  );
}
