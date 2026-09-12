/**
 * Small event bridge for the compact companion.
 *
 * The companion is self-contained: Chat is its own voice session and Work is
 * its own written panel. Neither reaches the Office Manager, which opens only
 * from its own control. The single remaining event simply re-shows the
 * companion after it has been collapsed to the edge tab.
 */

export const COMPANION_OPEN_EVENT = "canx:open-companion";

export function openCompanion() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COMPANION_OPEN_EVENT));
}
