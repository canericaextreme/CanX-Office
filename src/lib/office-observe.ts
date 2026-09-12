/**
 * CanX Office observation — opt-in, one-shot look at the Office page itself.
 *
 * IMPORTANT boundaries, by design:
 * - There is NO camera and NO screen sharing here. No media device and no
 *   screen-capture browser interface is used at all. It simply renders the
 *   marked CanX Office view element that is already in the page.
 * - It runs only when John presses "Observe Office". Nothing is continuous or
 *   in the background.
 * - Password, token, key and secret-like fields, every form field, and every
 *   element marked as excluded (the companion, the Work window, the Office
 *   Manager, alerts and overlays) are left out of both the picture and the text.
 * - The result is ephemeral: this module writes nothing to storage, files,
 *   records or logs.
 */

import { roomByRoute } from "@/lib/office-data";

/** Marks the single root element of the CanX Office view that may be observed. */
export const OFFICE_VIEW_ATTR = "data-canx-office-view";
/** Marks any element that must never appear in an observation. */
export const NO_CAPTURE_ATTR = "data-canx-no-capture";

export const OBSERVE_MAX_TEXT = 4000;
/** Bounded picture: long edge and encoded size are both capped. */
export const OBSERVE_MAX_WIDTH = 1100;
export const OBSERVE_MAX_IMAGE_BYTES = 1_400_000;
/**
 * A realtime data-channel message has to stay small, so the same picture is
 * shrunk further before it can be shared into a live voice conversation.
 */
export const REALTIME_MAX_IMAGE_CHARS = 180_000;
/** Below this the text stops being readable, so we give up instead. */
const REALTIME_MIN_WIDTH = 520;

const SENSITIVE_WORDS = /pass|pwd|token|key|secret|credential|otp|mfa|cvv|card/i;
const FIELD_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "OPTION", "FORM"]);

export interface OfficeObservationInput {
  path: string;
  room: string;
  text: string;
  /** data:image/jpeg;base64,… of the Office view only. */
  image: string;
  /**
   * The same picture, shrunk enough to travel over the live voice connection.
   * Memory only — it is never stored, logged or sent to the Office Manager.
   */
  voiceImage: string;
}

/** Strict client-side check before anything is put on the voice connection. */
export function validRealtimeImage(image: unknown): image is string {
  if (typeof image !== "string") return false;
  if (!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(image)) return false;
  return image.length <= REALTIME_MAX_IMAGE_CHARS;
}

/** A human room/page name for the path currently shown. */
export function officeRoomLabel(path: string): string {
  const room = roomByRoute(path);
  if (room) return room.label;
  if (path === "/" || path === "") return "Reception";
  const tail = path.split("/").filter(Boolean).pop() ?? "Office";
  return tail.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** True when an element must be kept out of the picture and the text. */
export function isExcludedElement(el: Element): boolean {
  if (el.hasAttribute(NO_CAPTURE_ATTR)) return true;
  if (el.closest(`[${NO_CAPTURE_ATTR}]`)) return true;
  if (FIELD_TAGS.has(el.tagName)) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.getAttribute("aria-hidden") === "true") return true;
  const fingerprint = [
    el.getAttribute("id") ?? "",
    el.getAttribute("name") ?? "",
    el.getAttribute("aria-label") ?? "",
    el.getAttribute("type") ?? "",
    el.getAttribute("autocomplete") ?? "",
  ].join(" ");
  return SENSITIVE_WORDS.test(fingerprint);
}

/** Bounded plain text of the Office view, with fields and excluded areas removed. */
export function collectOfficeText(root: HTMLElement, limit = OBSERVE_MAX_TEXT): string {
  const parts: string[] = [];
  const walk = (node: Element) => {
    if (node !== root && isExcludedElement(node)) return;
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const value = (child.textContent ?? "").replace(/\s+/g, " ").trim();
        if (value && !SENSITIVE_WORDS.test(value.slice(0, 40))) parts.push(value);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child as Element);
      }
    }
  };
  walk(root);
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const part of parts) {
    if (seen.has(part)) continue;
    seen.add(part);
    lines.push(part);
    if (lines.join(" · ").length > limit) break;
  }
  return lines.join(" · ").slice(0, limit);
}

/** The marked Office view root, or null when the page has none. */
export function findOfficeRoot(doc: Document = document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(`[${OFFICE_VIEW_ATTR}]`);
}

export type CaptureResult =
  | { ok: true; observation: OfficeObservationInput }
  | { ok: false; message: string };

/**
 * Renders ONLY the marked Office view to a bounded JPEG. Never the browser,
 * never another tab, never the whole computer — there is no fallback path that
 * could widen the capture.
 */
export async function captureOfficeView(path: string): Promise<CaptureResult> {
  const root = findOfficeRoot();
  if (!root) return { ok: false, message: "The office view could not be found on this page." };

  let canvas: HTMLCanvasElement;
  try {
    const { default: html2canvas } = await import("html2canvas-pro");
    const scale = Math.min(1, OBSERVE_MAX_WIDTH / Math.max(root.clientWidth, 1));
    canvas = await html2canvas(root, {
      backgroundColor: null,
      logging: false,
      scale,
      useCORS: true,
      ignoreElements: (el: Element) => isExcludedElement(el),
    });
  } catch {
    return { ok: false, message: "The office view could not be turned into a picture in this browser." };
  }

  const image = canvas.toDataURL("image/jpeg", 0.7);
  if (image.length > OBSERVE_MAX_IMAGE_BYTES)
    return { ok: false, message: "This office view is too large to observe. Try a smaller window." };

  return {
    ok: true,
    observation: { path, room: officeRoomLabel(path), text: collectOfficeText(root), image },
  };
}

/** The plain draft handed to the Office Manager — text only, never the picture. */
export function managerDraft(room: string, path: string, text: string): string {
  return `ChatGPT observation for review — ${room} (${path}):\n\n${text.trim()}`.slice(0, 4000);
}
