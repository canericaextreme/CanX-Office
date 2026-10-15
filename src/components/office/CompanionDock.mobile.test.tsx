// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ mobile: true }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("@/lib/use-realtime-chat", () => ({
  CHAT_PHASE_LABEL: { idle: "Ready" },
  useRealtimeChat: () => ({ phase: "idle", active: false, error: null }),
}));
vi.mock("@/components/office/CompanionWorkPanel", () => ({ CompanionWorkPanel: () => null }));
import { CompanionDock } from "./CompanionDock";

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); state.mobile = true; });
describe("mobile ChatGPT launcher", () => {
  it("navigates directly without an Office loading gate or a new-tab handoff", () => {
    render(<CompanionDock />);
    const link = screen.getByRole("link", { name: "Open ChatGPT in this tab" });
    expect(link.getAttribute("href")).toBe("https://chatgpt.com/");
    expect(link.getAttribute("target")).toBe("_self");
    expect(link.getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
  it("preserves desktop new-tab navigation", () => {
    state.mobile = false;
    render(<CompanionDock />);
    expect(screen.getByRole("link", { name: "Open ChatGPT in a new tab" }).getAttribute("target")).toBe("_blank");
  });
  it("opens and restores the launcher when browser storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    render(<CompanionDock />);
    fireEvent.click(screen.getByRole("button", { name: "Minimize the CanX chatbot" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore the CanX chatbot" }));
    expect(screen.getByRole("link", { name: "Open ChatGPT in this tab" })).toBeTruthy();
  });
});
