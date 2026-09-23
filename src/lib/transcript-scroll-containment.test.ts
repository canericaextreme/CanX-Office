import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const effects: Array<() => void | (() => void)> = [];
vi.mock("react", () => ({ useEffect: (effect: () => void | (() => void)) => effects.push(effect) }));

import { atScrollBoundary, useTranscriptScrollContainment } from "./use-transcript-scroll-containment";

function paneAt(scrollTop: number) {
  const listeners = new Map<string, EventListener>();
  const pane = {
    scrollTop,
    scrollHeight: 300,
    clientHeight: 100,
    addEventListener: vi.fn((type: string, fn: EventListener) => listeners.set(type, fn)),
    removeEventListener: vi.fn((type: string) => listeners.delete(type)),
  };
  const event = (deltaY: number, type: "touchmove" | "wheel") => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    if (type === "touchmove") {
      listeners.get("touchstart")?.({ touches: [{ clientY: 100 }] } as unknown as Event);
      listeners.get("touchmove")?.({
        touches: [{ clientY: 100 - deltaY }], preventDefault, stopPropagation,
      } as unknown as Event);
    } else {
      listeners.get("wheel")?.({ deltaY, preventDefault, stopPropagation } as unknown as Event);
    }
    return { preventDefault, stopPropagation };
  };
  return { pane, listeners, event };
}

afterEach(() => { effects.length = 0; });

describe("Astra transcript gesture containment", () => {
  it("detects top, middle, bottom and non-scrollable boundaries", () => {
    expect(atScrollBoundary(0, 300, 100, -10)).toBe(true);
    expect(atScrollBoundary(0, 300, 100, 10)).toBe(false);
    expect(atScrollBoundary(5, 300, 100, -20)).toBe(true);
    expect(atScrollBoundary(100, 300, 100, -10)).toBe(false);
    expect(atScrollBoundary(100, 300, 100, 10)).toBe(false);
    expect(atScrollBoundary(200, 300, 100, 10)).toBe(true);
    expect(atScrollBoundary(200, 300, 100, -10)).toBe(false);
    expect(atScrollBoundary(195, 300, 100, 20)).toBe(true);
    expect(atScrollBoundary(0, 50, 100, 10)).toBe(true);
    expect(atScrollBoundary(0, 50, 100, -10)).toBe(true);
  });

  for (const type of ["touchmove", "wheel"] as const) {
    it(`${type} blocks only outward scroll at each edge and never bubbles to the office`, () => {
      const { pane, event } = paneAt(0);
      useTranscriptScrollContainment({ current: pane } as never, true);
      const cleanup = effects[0]?.();
      expect(pane.addEventListener).toHaveBeenCalledWith(type, expect.any(Function), { passive: false });

      const atTop = event(-20, type);
      expect(atTop.preventDefault).toHaveBeenCalledOnce();
      expect(atTop.stopPropagation).toHaveBeenCalledOnce();
      const inward = event(20, type);
      expect(inward.preventDefault).not.toHaveBeenCalled();
      expect(inward.stopPropagation).toHaveBeenCalledOnce();

      pane.scrollTop = 100;
      for (const direction of [-20, 20]) {
        const middle = event(direction, type);
        expect(middle.preventDefault).not.toHaveBeenCalled();
        expect(middle.stopPropagation).toHaveBeenCalledOnce();
      }

      pane.scrollTop = 200;
      const bottom = event(20, type);
      expect(bottom.preventDefault).toHaveBeenCalledOnce();
      expect(bottom.stopPropagation).toHaveBeenCalledOnce();
      const backUp = event(-20, type);
      expect(backUp.preventDefault).not.toHaveBeenCalled();

      (cleanup as () => void)();
      expect(pane.removeEventListener).toHaveBeenCalledWith(type, expect.any(Function));
    });
  }

  it("wires only the open transcript, leaving panel dragging and controls alone", () => {
    const { pane } = paneAt(0);
    useTranscriptScrollContainment({ current: pane } as never, false);
    effects[0]?.();
    expect(pane.addEventListener).not.toHaveBeenCalled();

    const source = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
    expect(source).toContain('useTranscriptScrollContainment(messagesScrollRef, open && !minimized && tab === "now")');
    expect(source).toContain("ref={messagesScrollRef}");
    expect(source).toContain("useBackgroundScrollLock(open && !minimized)");
  });
});