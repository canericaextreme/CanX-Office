import { useEffect } from "react";

/**
 * Keeps the office underneath fixed while an overlay is open. Uses the
 * position:fixed body technique (reliable on Android/iOS), stops overscroll
 * chaining at the document level, and restores the exact previous scroll
 * position and inline styles on close/unmount. Panel scrolling is untouched.
 */
export function useBackgroundScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const prev = {
      position: body.style.position, top: body.style.top, left: body.style.left,
      right: body.style.right, width: body.style.width, overflow: body.style.overflow,
      htmlOverflow: html.style.overflow, htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      html.style.overflow = prev.htmlOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      window.scrollTo(scrollX, scrollY);
    };
  }, [active]);
}
