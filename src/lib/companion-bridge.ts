/**
 * Small event bridge for the compact companion.
 *
 * The companion is self-contained: Chat is its own voice session and Work is
 * its own written panel. Neither reaches the Office Manager on its own.
 *
 * The one deliberate exception is the handoff below, which happens ONLY when
 * John presses "Send to Manager" on an observation card. It carries plain text
 * for the Manager to prefill — it never sends, saves, approves or spends.
 */

export const COMPANION_OPEN_EVENT = "canx:open-companion";

export function openCompanion() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COMPANION_OPEN_EVENT));
}

export const MANAGER_HANDOFF_EVENT = "canx:manager-handoff";

export interface ManagerHandoff {
  /** Sanitized, bounded observation text. Never an image, never a secret. */
  text: string;
  room: string;
  path: string;
}

/** Prefills a draft in the Office Manager. Explicit click only; nothing is sent. */
export function sendManagerHandoff(detail: ManagerHandoff) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ManagerHandoff>(MANAGER_HANDOFF_EVENT, { detail }));
}
