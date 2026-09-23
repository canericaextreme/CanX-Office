import { useEffect, useRef } from "react";

/**
 * Phones: the open Astra panel lives inside a fixed, viewport-covering layer.
 * Gestures that start on the layer's transparent area (not the panel) are
 * cancelled so they can never reach or scroll the office beneath.
 */
export function shouldBlockOverlayGesture(layer: EventTarget | null, target: EventTarget | null) {
  return layer !== null && target === layer;
}

export function useMobileOverlayShield<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const layer = ref.current;
    if (!active || !layer) return;
    const block = (event: Event) => {
      if (shouldBlockOverlayGesture(layer, event.target)) event.preventDefault();
    };
    const opts: AddEventListenerOptions = { passive: false };
    layer.addEventListener("touchmove", block, opts);
    layer.addEventListener("wheel", block, opts);
    return () => {
      layer.removeEventListener("touchmove", block, opts);
      layer.removeEventListener("wheel", block, opts);
    };
  }, [active]);
  return ref;
}
