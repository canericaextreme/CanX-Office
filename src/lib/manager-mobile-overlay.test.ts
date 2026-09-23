import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { shouldBlockOverlayGesture } from "./use-mobile-overlay-shield";

const src = readFileSync("src/components/office/OfficeManager.tsx", "utf8");

describe("Astra mobile viewport-covering layer", () => {
  it("is active only on mobile while open and not minimized", () => {
    expect(src).toContain("const mobileShieldActive = isMobile && open && !minimized;");
  });
  it("renders a fixed inset-0 interactive layer above the office wrapping the panel", () => {
    expect(src).toMatch(/mobileShieldActive \? "pointer-events-auto fixed inset-0 z-\[60\] overflow-hidden overscroll-none"/);
    const layer = src.indexOf('data-testid="astra-mobile-overlay"');
    const aside = src.indexOf('id="office-manager-panel"');
    expect(layer).toBeGreaterThan(0);
    expect(aside).toBeGreaterThan(layer);
  });
  it("falls back to the unchanged floating panel on desktop and when inactive", () => {
    expect(src).toContain(': "contents"}');
    expect(src).toContain("{...(isMobile ? {} : panel.handleProps)}");
  });
  it("cancels gestures on the transparent layer area but not inside the panel", () => {
    const layer = {} as EventTarget;
    const transcript = {} as EventTarget;
    expect(shouldBlockOverlayGesture(layer, layer)).toBe(true);
    expect(shouldBlockOverlayGesture(layer, transcript)).toBe(false);
    expect(shouldBlockOverlayGesture(null, layer)).toBe(false);
  });
  it("uses non-passive listeners so preventDefault actually works on Android", () => {
    const hook = readFileSync("src/lib/use-mobile-overlay-shield.ts", "utf8");
    expect(hook).toContain("passive: false");
    expect(hook).toContain('"touchmove"');
    vi.fn();
  });
});
