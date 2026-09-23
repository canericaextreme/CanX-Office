import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const effects: (() => void | (() => void))[] = [];
vi.mock("react", () => ({ useEffect: (fn: () => void | (() => void)) => { effects.push(fn); } }));

function fakeDom() {
  const style = () => ({ position: "", top: "", left: "", right: "", width: "", overflow: "", overscrollBehavior: "", touchAction: "", scrollBehavior: "" });
  const body = { style: style() }, html = { style: style() };
  const backdrop = { style: style(), scrollTop: 135, scrollLeft: 2 };
  const documentScroller = { scrollTop: 420, scrollLeft: 0 };
  const scrollTo = vi.fn();
  vi.stubGlobal("document", { body, documentElement: html, scrollingElement: documentScroller, querySelector: vi.fn(() => backdrop) });
  vi.stubGlobal("window", { scrollY: 420, scrollX: 0, scrollTo });
  return { body, html, backdrop, documentScroller, scrollTo };
}

describe("Astra panel background scroll lock", () => {
  it("locks the office while open and restores the exact scroll position on close", async () => {
    const { useBackgroundScrollLock } = await import("./use-background-scroll-lock");
    const { body, html, backdrop, documentScroller, scrollTo } = fakeDom();
    effects.length = 0;
    useBackgroundScrollLock(true);
    const cleanup = effects[0]!();
    expect(body.style.position).toBe("fixed");
    expect(body.style.top).toBe("-420px");
    expect(body.style.overflow).toBe("hidden");
    expect(html.style.overscrollBehavior).toBe("none");
    expect(backdrop.style.position).toBe("fixed");
    expect(backdrop.style.top).toBe("-420px");
    expect(backdrop.style.overflow).toBe("hidden");
    expect(backdrop.style.touchAction).toBe("none");
    backdrop.scrollTop = 0;
    backdrop.scrollLeft = 0;
    documentScroller.scrollTop = 0;
    (cleanup as () => void)();
    expect(body.style.position).toBe("");
    expect(html.style.overflow).toBe("");
    expect(backdrop.style.position).toBe("");
    expect(backdrop.style.top).toBe("");
    expect(backdrop.style.overflow).toBe("");
    expect(backdrop.style.touchAction).toBe("");
    expect(backdrop.scrollTop).toBe(135);
    expect(backdrop.scrollLeft).toBe(2);
    expect(documentScroller.scrollTop).toBe(420);
    expect(html.style.scrollBehavior).toBe("");
    expect(scrollTo).toHaveBeenCalledWith(0, 420);
  });

  it("does nothing while closed", async () => {
    const { useBackgroundScrollLock } = await import("./use-background-scroll-lock");
    const { body } = fakeDom();
    effects.length = 0;
    useBackgroundScrollLock(false);
    expect(effects[0]!()).toBeUndefined();
    expect(body.style.position).toBe("");
  });

  it("restores pre-existing office styles, and falls back when no office backdrop exists", async () => {
    const { useBackgroundScrollLock } = await import("./use-background-scroll-lock");
    const { backdrop, body } = fakeDom();
    backdrop.style.overflow = "auto";
    backdrop.style.touchAction = "pan-y";
    effects.length = 0;
    useBackgroundScrollLock(true);
    const cleanup = effects[0]!();
    expect(backdrop.style.overflow).toBe("hidden");
    (cleanup as () => void)();
    expect(backdrop.style.overflow).toBe("auto");
    expect(backdrop.style.touchAction).toBe("pan-y");

    vi.stubGlobal("document", { body, documentElement: { style: { overflow: "", overscrollBehavior: "" } }, querySelector: () => null });
    effects.length = 0;
    useBackgroundScrollLock(true);
    expect(() => (effects[0]!() as () => void)()).not.toThrow();
  });

  it("is wired to the open panel and every panel scroll area contains overscroll", () => {
    const src = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
    expect(src).toContain("useBackgroundScrollLock(open && !minimized)");
    const shell = readFileSync("src/routes/_office.tsx", "utf8");
    expect(shell).toContain('data-canx-office-backdrop="true"');
    expect(shell.indexOf("<OfficeManager />")).toBeGreaterThan(shell.indexOf('data-canx-office-backdrop="true"'));
    expect(shell.indexOf("<OfficeManager />")).toBeGreaterThan(shell.indexOf("</div>\n      {/* Overlays"));
    expect(src).toContain('ref={messagesScrollRef}');
    expect(src).toContain('useTranscriptScrollContainment(messagesScrollRef, open && !minimized && tab === "now")');
    expect(src.match(/overflow-y-auto(?! overscroll-contain)/g)).toBeNull();
    expect(src).toContain("flex-col overflow-hidden overscroll-contain rounded-xl");
  });
});
