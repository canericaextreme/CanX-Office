import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const effects: (() => void | (() => void))[] = [];
vi.mock("react", () => ({ useEffect: (fn: () => void | (() => void)) => { effects.push(fn); } }));

function fakeDom() {
  const style = () => ({ position: "", top: "", left: "", right: "", width: "", overflow: "", overscrollBehavior: "" } as Record<string, string>);
  const body = { style: style() }, html = { style: style() };
  const scrollTo = vi.fn();
  vi.stubGlobal("document", { body, documentElement: html });
  vi.stubGlobal("window", { scrollY: 420, scrollX: 0, scrollTo });
  return { body, html, scrollTo };
}

describe("Astra panel background scroll lock", () => {
  it("locks the office while open and restores the exact scroll position on close", async () => {
    const { useBackgroundScrollLock } = await import("./use-background-scroll-lock");
    const { body, html, scrollTo } = fakeDom();
    effects.length = 0;
    useBackgroundScrollLock(true);
    const cleanup = effects[0]!();
    expect(body.style.position).toBe("fixed");
    expect(body.style.top).toBe("-420px");
    expect(body.style.overflow).toBe("hidden");
    expect(html.style.overscrollBehavior).toBe("none");
    (cleanup as () => void)();
    expect(body.style.position).toBe("");
    expect(html.style.overflow).toBe("");
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

  it("is wired to the open panel and every panel scroll area contains overscroll", () => {
    const src = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
    expect(src).toContain("useBackgroundScrollLock(open && !minimized)");
    expect(src.match(/overflow-y-auto(?! overscroll-contain)/g)).toBeNull();
    expect(src).toContain("flex-col overflow-hidden overscroll-contain rounded-xl");
  });
});
