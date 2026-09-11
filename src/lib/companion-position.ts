"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface CompanionPosition {
  left: number;
  top: number;
}

export const COMPANION_POSITION_KEY = "canx.companion.position";

/** Keeps the whole control inside the visible viewport. */
export function clampCompanionPosition(
  pos: CompanionPosition,
  viewport: { width: number; height: number },
  size: { width: number; height: number },
): CompanionPosition {
  return {
    left: Math.max(0, Math.min(Math.round(pos.left), Math.max(0, viewport.width - size.width))),
    top: Math.max(0, Math.min(Math.round(pos.top), Math.max(0, viewport.height - size.height))),
  };
}

export function readStoredPosition(raw: string | null): CompanionPosition | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CompanionPosition>;
    if (typeof parsed?.left !== "number" || typeof parsed?.top !== "number") return null;
    if (!Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) return null;
    return { left: parsed.left, top: parsed.top };
  } catch {
    return null;
  }
}

/**
 * Drag anywhere in the viewport, remembered between visits and re-clamped on
 * resize or orientation change so the control can never be lost off-screen.
 */
export function useCompanionPosition() {
  const ref = useRef<HTMLElement>(null);
  const [pos, setPos] = useState<CompanionPosition | null>(null);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0, left: 0, top: 0 });

  const measure = useCallback(() => {
    const el = ref.current;
    return { width: el?.offsetWidth || 128, height: el?.offsetHeight || 128 };
  }, []);

  const clamp = useCallback(
    (next: CompanionPosition) =>
      typeof window === "undefined"
        ? next
        : clampCompanionPosition(next, { width: window.innerWidth, height: window.innerHeight }, measure()),
    [measure],
  );

  // First paint: stored position, otherwise the bottom-left resting place.
  useEffect(() => {
    const size = measure();
    const stored = readStoredPosition(window.localStorage.getItem(COMPANION_POSITION_KEY));
    setPos(
      clampCompanionPosition(
        stored ?? { left: 16, top: window.innerHeight - size.height - 16 },
        { width: window.innerWidth, height: window.innerHeight },
        size,
      ),
    );
  }, [measure]);

  useEffect(() => {
    const reclamp = () => setPos((current) => (current ? clamp(current) : current));
    window.addEventListener("resize", reclamp);
    window.addEventListener("orientationchange", reclamp);
    return () => {
      window.removeEventListener("resize", reclamp);
      window.removeEventListener("orientationchange", reclamp);
    };
  }, [clamp]);

  const persist = useCallback((next: CompanionPosition) => {
    try {
      window.localStorage.setItem(COMPANION_POSITION_KEY, JSON.stringify(next));
    } catch {
      /* storage may be unavailable; the position simply is not remembered */
    }
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!pos) return;
      event.preventDefault();
      setDragging(true);
      startRef.current = { x: event.clientX, y: event.clientY, left: pos.left, top: pos.top };
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    },
    [pos],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const next = clamp({
        left: startRef.current.left + (event.clientX - startRef.current.x),
        top: startRef.current.top + (event.clientY - startRef.current.y),
      });
      setPos(next);
    };
    const up = () => {
      setDragging(false);
      setPos((current) => {
        if (current) persist(current);
        return current;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging, clamp, persist]);

  /** Keyboard nudging keeps the control movable without a pointer. */
  const nudge = useCallback(
    (dx: number, dy: number) => {
      setPos((current) => {
        if (!current) return current;
        const next = clamp({ left: current.left + dx, top: current.top + dy });
        persist(next);
        return next;
      });
    },
    [clamp, persist],
  );

  return { ref, pos, dragging, onPointerDown, nudge };
}
