/**
 * Reads which boxes John's open room page shows, for Elsie's room guide. CLIENT ONLY.
 *
 * It reads the page that is already on John's screen: each <RoomBox> wrapper (data-room-box),
 * its built name, John's Edit-tab name, the room it was built in, and its first visible words.
 * No screenshot, no network, no storage. Hidden copies (a home room mounted only to lend a moved
 * box) are skipped. The server treats the result as untrusted data (see room-guide.ts).
 */
import { cleanRoute } from "./office-room-identity";
import { SCREEN_MAX_BOXES, type ScreenBox, type ScreenSnapshot } from "./room-guide";

const words = (text: string | null | undefined, max: number) =>
  (text ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function collectScreenSnapshot(
  route: string,
  doc: Document | undefined = typeof document === "undefined" ? undefined : document,
  now = new Date(),
): ScreenSnapshot | null {
  if (!doc) return null;
  const here = cleanRoute(route);
  if (!here) return null;
  try {
    const boxes: ScreenBox[] = [];
    const seen = new Set<string>();
    let editing = false;
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[data-room-box]"))) {
      if (boxes.length >= SCREEN_MAX_BOXES) break;
      if (el.closest("[hidden], [aria-hidden='true']")) continue;
      // Count only the outermost box: a box inside another box is read as part of it.
      if (el.parentElement?.closest("[data-room-box]")) continue;
      const id = el.getAttribute("data-room-box") ?? "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (el.classList.contains("canx-room-box-editing")) editing = true;
      const name = el.getAttribute("data-room-box-name") ?? id;
      const renamed = el.getAttribute("data-room-box-renamed") ?? "";
      const home = el.getAttribute("data-room-box-home") ?? "";
      boxes.push({
        id,
        name: words(name, 80),
        ...(renamed ? { renamed: words(renamed, 80) } : {}),
        ...(home && cleanRoute(home) !== here ? { movedFrom: home } : {}),
        excerpt: words(el.innerText || el.textContent, 240),
      });
    }
    return { route: here, collectedAt: now.toISOString(), editing, boxes };
  } catch {
    return null;
  }
}
