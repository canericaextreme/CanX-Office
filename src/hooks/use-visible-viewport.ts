import { useEffect, useState, type CSSProperties } from "react";

/** Mobile browsers often resize only VisualViewport when the keyboard opens. */
export function useVisibleViewport(active: boolean) {
  const [style, setStyle] = useState<CSSProperties>();
  useEffect(() => {
    if (!active) { setStyle(undefined); return; }
    const viewport = window.visualViewport;
    const update = () => setStyle({
      top: viewport?.offsetTop ?? 0,
      left: viewport?.offsetLeft ?? 0,
      width: viewport?.width ?? window.innerWidth,
      height: viewport?.height ?? window.innerHeight,
    });
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [active]);
  return style;
}
