import { useEffect } from "react";

/**
 * Keeps the office underneath fixed while an overlay is open. Uses the
 * Freezes both the document and the actual office backdrop. The Manager panel
 * lives outside that backdrop so its transcript and controls remain independent.
 */
export function useBackgroundScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const body = document.body;
    const html = document.documentElement;
    const backdrop = document.querySelector<HTMLElement>("[data-canx-office-backdrop]");
    const documentScroller = document.scrollingElement;
    const scrollY = documentScroller?.scrollTop ?? window.scrollY;
    const scrollX = documentScroller?.scrollLeft ?? window.scrollX;
    const backdropScrollTop = backdrop?.scrollTop ?? 0;
    const backdropScrollLeft = backdrop?.scrollLeft ?? 0;
    const backdropStyles = backdrop && {
      position: backdrop.style.position,
      top: backdrop.style.top,
      left: backdrop.style.left,
      right: backdrop.style.right,
      width: backdrop.style.width,
      overflow: backdrop.style.overflow,
      touchAction: backdrop.style.touchAction,
      overscrollBehavior: backdrop.style.overscrollBehavior,
    };
    const prev = {
      position: body.style.position, top: body.style.top, left: body.style.left,
      right: body.style.right, width: body.style.width, overflow: body.style.overflow,
      htmlOverflow: html.style.overflow, htmlOverscroll: html.style.overscrollBehavior,
      htmlScrollBehavior: html.style.scrollBehavior,
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
    if (backdrop) {
      // The room is a tall page under the office shell. Freezing only body
      // leaves that shell free to move on some mobile browsers. A fixed sibling
      // backdrop cannot be scrolled by gestures on the Manager panel.
      backdrop.style.position = "fixed";
      backdrop.style.top = `-${scrollY}px`;
      backdrop.style.left = `-${scrollX}px`;
      backdrop.style.right = "0";
      backdrop.style.width = "100%";
      backdrop.style.overflow = "hidden";
      backdrop.style.touchAction = "none";
      backdrop.style.overscrollBehavior = "none";
    }
    return () => {
      if (backdrop && backdropStyles) {
        backdrop.style.position = backdropStyles.position;
        backdrop.style.top = backdropStyles.top;
        backdrop.style.left = backdropStyles.left;
        backdrop.style.right = backdropStyles.right;
        backdrop.style.width = backdropStyles.width;
        backdrop.style.overflow = backdropStyles.overflow;
        backdrop.style.touchAction = backdropStyles.touchAction;
        backdrop.style.overscrollBehavior = backdropStyles.overscrollBehavior;
        backdrop.scrollTop = backdropScrollTop;
        backdrop.scrollLeft = backdropScrollLeft;
      }
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      html.style.overflow = prev.htmlOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      // Global smooth scrolling must not animate the office back into place.
      html.style.scrollBehavior = "auto";
      window.scrollTo(scrollX, scrollY);
      if (documentScroller) {
        documentScroller.scrollTop = scrollY;
        documentScroller.scrollLeft = scrollX;
      }
      html.style.scrollBehavior = prev.htmlScrollBehavior;
    };
  }, [active]);
}
