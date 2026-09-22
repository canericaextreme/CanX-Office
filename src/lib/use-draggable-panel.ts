"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PanelPosition {
  right: number;
  bottom: number;
}

export interface DraggablePanelOptions {
  initial?: Partial<PanelPosition>;
}

export function clampPanelPosition(
  pos: PanelPosition,
  viewport: { width: number; height: number },
  panel: { width: number; height: number },
): PanelPosition {
  return {
    right: Math.max(0, Math.min(pos.right, viewport.width - panel.width)),
    bottom: Math.max(0, Math.min(pos.bottom, viewport.height - panel.height)),
  };
}

export function useDraggablePanel(options: DraggablePanelOptions = {}) {
  const ref = useRef<HTMLElement>(null);
  const [pos, setPos] = useState<PanelPosition>({
    right: options.initial?.right ?? 16,
    bottom: options.initial?.bottom ?? 80,
  });
  const draggingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0, right: pos.right, bottom: pos.bottom });

  const measure = useCallback((): { width: number; height: number } => {
    const el = ref.current;
    if (el) return { width: el.offsetWidth, height: el.offsetHeight };
    if (typeof window === "undefined") return { width: 416, height: 600 };
    return {
      width: Math.min(26 * 16, window.innerWidth - 32),
      height: Math.min(Math.round(window.innerHeight * 0.78), window.innerHeight - 96),
    };
  }, []);

  const clamp = useCallback(
    (next: PanelPosition) =>
      typeof window === "undefined"
        ? next
        : clampPanelPosition(next, { width: window.innerWidth, height: window.innerHeight }, measure()),
    [measure],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      draggingRef.current = true;
      startRef.current = {
        x: event.clientX,
        y: event.clientY,
        right: pos.right,
        bottom: pos.bottom,
      };
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    },
    [pos],
  );

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = startRef.current.x - event.clientX;
      const dy = event.clientY - startRef.current.y;
      setPos(clamp({ right: startRef.current.right + dx, bottom: startRef.current.bottom - dy }));
    };
    const handleUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [clamp]);

  return {
    ref,
    moveToSide: (side: "left" | "right") => setPos(clamp({ right: side === "right" ? 16 : window.innerWidth - measure().width - 16, bottom: pos.bottom })),
    style: { right: pos.right, bottom: pos.bottom },
    handleProps: {
      onPointerDown,
      className: "cursor-move touch-none select-none",
      "aria-label": "Drag to move the Office Manager panel",
      title: "Drag to move",
    },
  };
}
