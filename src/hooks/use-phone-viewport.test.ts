// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { PHONE_VIEWPORT_QUERY, phoneViewportStyle, usePhoneViewport } from "./use-phone-viewport";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Elsie's reachable phone composer", () => {
  it.each([
    { width: 393, height: 851, offsetLeft: 0, offsetTop: 0 },
    { width: 393, height: 330, offsetLeft: 0, offsetTop: 120 },
    { width: 851, height: 220, offsetLeft: 0, offsetTop: 0 },
  ])("fits the visible phone viewport, including keyboard/pan: %j", (viewport) => {
    expect(phoneViewportStyle(viewport)).toEqual({ left: viewport.offsetLeft, top: viewport.offsetTop,
      width: viewport.width, height: viewport.height, maxHeight: viewport.height, right: "auto", bottom: "auto" });
  });

  it("updates on keyboard resize and visual pan, and removes listeners on close", () => {
    const visual = Object.assign(new EventTarget(), { width: 393, height: 851, offsetLeft: 0, offsetTop: 0 });
    const media = Object.assign(new EventTarget(), { matches: true });
    const remove = vi.spyOn(visual, "removeEventListener");
    vi.stubGlobal("visualViewport", visual);
    vi.stubGlobal("matchMedia", vi.fn(() => media));
    const { result, unmount } = renderHook(usePhoneViewport);
    expect(window.matchMedia).toHaveBeenCalledWith(PHONE_VIEWPORT_QUERY);
    act(() => { visual.height = 330; visual.dispatchEvent(new Event("resize")); });
    expect(result.current.style?.height).toBe(330);
    act(() => { visual.offsetTop = 120; visual.dispatchEvent(new Event("scroll")); });
    expect(result.current.style?.top).toBe(120);
    act(() => { media.matches = false; media.dispatchEvent(new Event("change")); });
    expect(result.current.phone).toBe(false);
    unmount();
    expect(remove.mock.calls.map(([name]) => name)).toEqual(["resize", "scroll"]);
  });

  it("covers landscape touch phones and supports browsers without visualViewport", () => {
    expect(PHONE_VIEWPORT_QUERY).toContain("(pointer: coarse)");
    expect(PHONE_VIEWPORT_QUERY).toContain("(max-width: 1366px)");
    vi.stubGlobal("visualViewport", undefined);
    vi.stubGlobal("matchMedia", () => Object.assign(new EventTarget(), { matches: true }));
    const { result } = renderHook(usePhoneViewport);
    expect(result.current.style?.height).toBe(window.innerHeight);
    expect(result.current.style?.top).toBe(0);
  });

  it("refits the open phone panel on portrait–landscape–portrait rotation", () => {
    const visual = Object.assign(new EventTarget(), { width: 393, height: 851, offsetLeft: 0, offsetTop: 0 });
    vi.stubGlobal("visualViewport", visual);
    vi.stubGlobal("matchMedia", () => Object.assign(new EventTarget(), { matches: true }));
    const { result } = renderHook(usePhoneViewport);

    for (const size of [{ width: 851, height: 393 }, { width: 393, height: 851 }]) {
      act(() => { Object.assign(visual, size); visual.dispatchEvent(new Event("resize")); });
      expect(result.current.phone).toBe(true);
      expect(result.current.height).toBe(size.height);
      expect(result.current.style).toMatchObject({ ...size, maxHeight: size.height });
    }
  });

  it("refits on rotation through window resize when visualViewport is unavailable", () => {
    vi.stubGlobal("visualViewport", undefined);
    vi.stubGlobal("matchMedia", () => Object.assign(new EventTarget(), { matches: true }));
    vi.stubGlobal("innerWidth", 393);
    vi.stubGlobal("innerHeight", 851);
    const { result } = renderHook(usePhoneViewport);

    for (const size of [{ width: 851, height: 393 }, { width: 393, height: 851 }]) {
      act(() => {
        vi.stubGlobal("innerWidth", size.width);
        vi.stubGlobal("innerHeight", size.height);
        window.dispatchEvent(new Event("resize"));
      });
      expect(result.current.phone).toBe(true);
      expect(result.current.style).toMatchObject({ ...size, maxHeight: size.height });
    }
  });

  it("opens the paste target without autofocus or changing voice handlers", () => {
    const source = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    expect(source).toContain("if (isMobile && open) setComposerCollapsed(false);");
    expect(source).toContain('data-phone={mobileShieldActive ? "true" : undefined}');
    expect(css).toContain('#office-manager-panel[data-phone="true"] .canx-elsie-message { min-height: 88px;');
    expect(css).toContain('#office-manager-panel[data-phone="true"] .canx-elsie-voice-controls { order: 0;');
    expect(css).toContain("max-height: 65%;");
  });
});
