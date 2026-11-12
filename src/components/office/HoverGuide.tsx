/**
 * Hover guide — point at anything in the Office and it explains itself. John, 12 Nov 2026:
 * "as i hover from item to item it should tell me an explanation of each".
 *
 * One listener for the whole Office (not one per item). The innermost thing under the pointer
 * wins: a button or link, then the box it sits in, then the room. Moving from item to item swaps
 * the explanation straight away; the first one waits a moment so a passing mouse doesn't flash.
 *  - Mouse or pen: rest on an item.
 *  - Phone or tablet: press and hold an item (a quick tap still works as normal).
 *  - Keyboard: Tab to an item.
 * The card never takes clicks (pointer-events: none) and is left out of room pictures.
 * Box labels are switched off while the Edit tab is unlocked, so they never cover its controls.
 * Words: src/lib/hover-guide.ts and src/lib/box-descriptions.ts. Text only, no AI call.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { boxTip, buttonTip, roomTip, type HoverTip } from "@/lib/hover-guide";

export const FIRST_HOVER_MS = 350;
export const HOLD_MS = 550;
const HOLD_SLOP_PX = 10;
const CARD_WIDTH = 320;

const ROOT = "[data-canx-hover-root]";
const SKIP =
  "[data-canx-box-bar], [role='dialog'], [role='menu'], [role='listbox'], [data-canx-hover-card], input, textarea, select, [contenteditable='true']";
const ACTIONABLE = "a[href], button, [role='button'], [role='tab'], [role='link'], summary";

interface Found {
  key: string;
  tip: HoverTip;
  el: HTMLElement;
}

const labelOf = (el: HTMLElement) =>
  (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "")
    .replace(/\s+/g, " ")
    .trim();

function pathOfLink(el: HTMLElement): string | null {
  const href = el.getAttribute("href");
  if (!href || /^(https?:|mailto:|tel:)/i.test(href) || href.startsWith("#")) return null;
  return href.split(/[?#]/)[0] || "/";
}

/** What to explain for the thing under the pointer, innermost first. */
export function findTip(target: EventTarget | null, pathname: string): Found | null {
  if (!(target instanceof Element)) return null;
  const root = target.closest(ROOT);
  if (!root || target.closest(SKIP)) return null;
  for (let el: Element | null = target; el && el !== root; el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.matches(ACTIONABLE)) {
      const path = el.tagName === "A" ? pathOfLink(el) : null;
      const room = path ? roomTip(path) : null;
      if (room) return { key: `room:${path}:${labelOf(el)}`, tip: room, el };
      const box = el.closest<HTMLElement>("[data-room-box]");
      const tip = buttonTip(
        labelOf(el),
        box?.getAttribute("data-room-box"),
        box?.getAttribute("data-room-box-renamed") || box?.getAttribute("data-room-box-name"),
      );
      if (tip)
        return {
          key: `button:${labelOf(el)}:${box?.getAttribute("data-room-box") ?? ""}`,
          tip,
          el,
        };
      continue;
    }
    if (el.hasAttribute("data-room-box")) {
      if (el.classList.contains("canx-room-box-editing")) return null;
      const id = el.getAttribute("data-room-box") ?? "";
      const name = el.getAttribute("data-room-box-name") ?? id;
      const home = el.getAttribute("data-room-box-home");
      const here = pathname.replace(/\/+$/, "") || "/";
      return {
        key: `box:${id}`,
        tip: boxTip(
          id,
          name,
          el.getAttribute("data-room-box-renamed"),
          home && home !== here ? home : null,
        ),
        el,
      };
    }
    if (el.tagName === "H1") {
      const room = roomTip(pathname);
      if (room) return { key: `room:${pathname}:h1`, tip: room, el };
    }
  }
  return null;
}

interface Pos {
  top: number;
  left: number;
  above: boolean;
}

function placeFor(el: HTMLElement): Pos {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth || 1024;
  const vh = window.innerHeight || 768;
  const width = Math.min(CARD_WIDTH, vw - 16);
  const left = Math.max(8, Math.min(r.left, vw - width - 8));
  if (r.top >= 110) return { top: r.top - 6, left, above: true };
  if (r.bottom + 8 < vh - 100) return { top: r.bottom + 6, left, above: false };
  return { top: Math.max(r.top, 0) + 8, left, above: false };
}

const currentPath = () => (typeof window === "undefined" ? "/" : window.location.pathname);

export function HoverGuide() {
  const [shown, setShown] = useState<(Found & { pos: Pos }) | null>(null);
  const shownRef = useRef<Found | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hold = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = useCallback((found: Found | null) => {
    shownRef.current = found;
    setShown(found ? { ...found, pos: placeFor(found.el) } : null);
  }, []);

  useEffect(() => {
    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const found = findTip(e.target, currentPath());
      if (found?.key === shownRef.current?.key && found) return;
      clear();
      if (!found) {
        if (shownRef.current) show(null);
        return;
      }
      // Already explaining something: swap straight to the next item.
      if (shownRef.current) {
        show(found);
        return;
      }
      timer.current = setTimeout(() => {
        timer.current = null;
        show(found);
      }, FIRST_HOVER_MS);
    };
    const leaveWindow = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (!e.relatedTarget) {
        clear();
        show(null);
      }
    };
    const down = (e: PointerEvent) => {
      held.current = false;
      clear();
      if (shownRef.current) show(null);
      if (e.pointerType !== "touch") return;
      const found = findTip(e.target, currentPath());
      if (!found) return;
      hold.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        held.current = true;
        show(found);
      }, HOLD_MS);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !hold.current) return;
      if (Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > HOLD_SLOP_PX) {
        clear();
        hold.current = null;
      }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      hold.current = null;
      if (timer.current) clear();
    };
    // After a press-and-hold, don't also follow the link or open the phone's own menu.
    const click = (e: MouseEvent) => {
      if (!held.current) return;
      held.current = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const menu = (e: MouseEvent) => {
      if (held.current || (timer.current && hold.current)) e.preventDefault();
    };
    const focus = (e: FocusEvent) => {
      let keyboard = false;
      try {
        keyboard = e.target instanceof Element && e.target.matches(":focus-visible");
      } catch {
        keyboard = false;
      }
      if (keyboard) show(findTip(e.target, currentPath()));
    };
    const blur = (e: FocusEvent) => {
      if (shownRef.current && shownRef.current.el.contains(e.target as Node)) show(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && shownRef.current) show(null);
    };
    const follow = () => {
      const s = shownRef.current;
      if (!s) return;
      if (!s.el.isConnected) return show(null);
      setShown({ ...s, pos: placeFor(s.el) });
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", leaveWindow);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    document.addEventListener("click", click, true);
    document.addEventListener("contextmenu", menu, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      clear();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", leaveWindow);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("contextmenu", menu, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [show]);

  if (!shown || typeof document === "undefined") return null;
  const { tip, pos } = shown;
  return createPortal(
    <div
      role="tooltip"
      data-canx-no-capture="true"
      data-canx-hover-card={tip.kind}
      className="canx-box-label"
      style={{
        top: pos.top,
        left: pos.left,
        transform: pos.above ? "translateY(-100%)" : undefined,
      }}
    >
      <p className="canx-box-label-title">{tip.title}</p>
      {tip.note && <p className="canx-box-label-note">{tip.note}</p>}
      <p className="canx-box-label-what">{tip.what}</p>
      {tip.why && (
        <p className="canx-box-label-why">
          {tip.kind !== "button" && <span className="canx-box-label-key">What it's for: </span>}
          {tip.why}
        </p>
      )}
    </div>,
    document.body,
  );
}
