/**
 * Small event bridge between the compact companion and the Office Manager.
 *
 * Two clearly separate modes:
 *   CHAT — the companion's own conversational voice session (see
 *          use-realtime-chat.ts). It does not run through the Office Manager's
 *          browser speech engine.
 *   WORK — asks the existing Office Manager to show its work/progress panel.
 */

export const COMPANION_WORK_EVENT = "canx:companion-work";
/** Kept so any remaining shortcut can re-show the companion. */
export const COMPANION_OPEN_EVENT = "canx:open-companion";

export function requestCompanionWork() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COMPANION_WORK_EVENT));
}

export function openCompanion() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COMPANION_OPEN_EVENT));
}
