// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVisibleViewport } from "./use-visible-viewport";
import { useIsMobile } from "./use-mobile";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("phone viewport", () => {
  it("follows portrait, landscape, keyboard and viewport pan; removes listeners", () => {
    const viewport = Object.assign(new EventTarget(), { width: 390, height: 844, offsetTop: 0, offsetLeft: 0 });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    const remove = vi.spyOn(viewport, "removeEventListener");
    const { result, unmount } = renderHook(() => useVisibleViewport(true));
    expect(result.current).toEqual({ width: 390, height: 844, top: 0, left: 0 });
    act(() => { Object.assign(viewport, { width: 844, height: 390 }); viewport.dispatchEvent(new Event("resize")); });
    expect(result.current?.height).toBe(390);
    expect(result.current?.width).toBe(844);
    act(() => { Object.assign(viewport, { height: 170, offsetTop: 30 }); viewport.dispatchEvent(new Event("resize")); });
    expect(result.current?.height).toBe(170);
    act(() => { viewport.offsetTop = 50; viewport.dispatchEvent(new Event("scroll")); });
    expect(result.current?.top).toBe(50);
    unmount();
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
  it("leaves desktop sizing alone", () => {
    const { result } = renderHook(() => useVisibleViewport(false));
    expect(result.current).toBeUndefined();
  });
  it("keeps a rotated touch phone mobile and responds when returning to desktop", () => {
    const media = Object.assign(new EventTarget(), { matches: true });
    const matchMedia = vi.fn((_query: string) => media);
    vi.stubGlobal("matchMedia", matchMedia);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    expect(matchMedia.mock.calls[0]?.[0]).toContain("(pointer: coarse)");
    act(() => { media.matches = false; media.dispatchEvent(new Event("change")); });
    expect(result.current).toBe(false);
  });
});
