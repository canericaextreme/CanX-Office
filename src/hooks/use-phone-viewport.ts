import { useEffect, useState, type CSSProperties } from "react";

// Include landscape phones: a width-only 767px breakpoint misses them.
export const PHONE_VIEWPORT_QUERY = "(max-width: 767px), (hover: none) and (pointer: coarse) and (max-width: 1366px)";

export function phoneViewportStyle(viewport: { width: number; height: number; offsetLeft: number; offsetTop: number }): CSSProperties {
  return { left: viewport.offsetLeft, top: viewport.offsetTop, width: viewport.width,
    height: viewport.height, maxHeight: viewport.height, right: "auto", bottom: "auto" };
}

/** Layout only. Follow Android's visible viewport when the keyboard opens/pans. */
export function usePhoneViewport() {
  const [viewport, setViewport] = useState<{ phone: boolean; height: number; style?: CSSProperties }>({ phone: false, height: 0 });
  useEffect(() => {
    const media = window.matchMedia(PHONE_VIEWPORT_QUERY);
    const visual = window.visualViewport;
    const update = () => setViewport({
      phone: media.matches,
      height: visual?.height ?? window.innerHeight,
      style: phoneViewportStyle(visual ?? { width: window.innerWidth, height: window.innerHeight, offsetLeft: 0, offsetTop: 0 }),
    });
    update();
    media.addEventListener("change", update);
    window.addEventListener("resize", update);
    visual?.addEventListener("resize", update);
    visual?.addEventListener("scroll", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      visual?.removeEventListener("resize", update);
      visual?.removeEventListener("scroll", update);
    };
  }, []);
  return viewport;
}
