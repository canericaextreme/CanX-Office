import { useEffect, type RefObject } from "react";

/** A scroll gesture at the transcript edge must never chain into the office. */
export function atScrollBoundary(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  deltaY: number,
) {
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  return deltaY < 0
    ? scrollTop + deltaY <= 0
    : deltaY > 0 && scrollTop + deltaY >= maxScroll;
}

export function useTranscriptScrollContainment(
  ref: RefObject<HTMLDivElement | null>,
  active: boolean,
) {
  useEffect(() => {
    const pane = ref.current;
    if (!active || !pane) return;

    let lastY: number | null = null;
    const onTouchStart = (event: TouchEvent) => {
      lastY = event.touches.length === 1 ? event.touches[0]?.clientY ?? null : null;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1 || lastY === null) return;
      const nextY = event.touches[0]?.clientY;
      if (nextY === undefined) return;
      const deltaY = lastY - nextY;
      lastY = nextY;
      // Preserve normal scrolling, text selection and taps. Only block the
      // browser's default scroll when this gesture would leave the pane.
      if (atScrollBoundary(pane.scrollTop, pane.scrollHeight, pane.clientHeight, deltaY)) {
        event.preventDefault();
      }
      event.stopPropagation();
    };
    const onTouchEnd = () => { lastY = null; };
    const onWheel = (event: WheelEvent) => {
      if (atScrollBoundary(pane.scrollTop, pane.scrollHeight, pane.clientHeight, event.deltaY)) {
        event.preventDefault();
      }
      event.stopPropagation();
    };

    pane.addEventListener("touchstart", onTouchStart, { passive: true });
    pane.addEventListener("touchmove", onTouchMove, { passive: false });
    pane.addEventListener("touchend", onTouchEnd);
    pane.addEventListener("touchcancel", onTouchEnd);
    pane.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      pane.removeEventListener("touchstart", onTouchStart);
      pane.removeEventListener("touchmove", onTouchMove);
      pane.removeEventListener("touchend", onTouchEnd);
      pane.removeEventListener("touchcancel", onTouchEnd);
      pane.removeEventListener("wheel", onWheel);
    };
  }, [ref, active]);
}