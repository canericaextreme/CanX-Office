import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMPANION_CHAT_EVENT,
  COMPANION_WORK_EVENT,
  IDLE_MANAGER_VOICE_STATE,
  isVoiceActive,
  managerVoiceLabel,
} from "./companion-bridge";
import { clampCompanionPosition, readStoredPosition, COMPANION_POSITION_KEY } from "./companion-position";

const dockSource = readFileSync("src/components/office/CompanionDock.tsx", "utf8");
const navSource = readFileSync("src/components/office/OfficeNav.tsx", "utf8");
const managerSource = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
const layoutSource = readFileSync("src/routes/_office.tsx", "utf8");

describe("compact CanX companion", () => {
  it("is mounted beside, not inside, the Office Manager", () => {
    expect(layoutSource).toContain("<CompanionDock />");
    expect(layoutSource).toContain("<OfficeManager />");
  });

  it("keeps a compact square footprint with a dedicated drag handle", () => {
    expect(dockSource).toContain("h-28 w-28");
    expect(dockSource).toContain("sm:h-32 sm:w-32");
    expect(dockSource).toContain("canx-companion-drag-handle");
    expect(dockSource).toContain("onPointerDown={onPointerDown}");
    // Chat, Work and X must not begin a drag.
    expect(dockSource.match(/onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/g)).toHaveLength(3);
  });

  it("never opens an external window and never shows transcript text", () => {
    expect(dockSource).not.toContain("chatgpt");
    expect(dockSource).not.toContain("window.open");
    expect(dockSource).not.toContain("iframe");
    expect(dockSource).not.toMatch(/messages|transcript|interim/);
  });

  it("uses the existing Office Manager voice and work controls", () => {
    expect(dockSource).toContain("requestCompanionChat");
    expect(dockSource).toContain("requestCompanionWork");
    expect(managerSource).toContain("COMPANION_CHAT_EVENT");
    expect(managerSource).toContain("COMPANION_WORK_EVENT");
    expect(managerSource).toContain("publishManagerVoiceState");
    expect(COMPANION_CHAT_EVENT).toBe("canx:companion-chat");
    expect(COMPANION_WORK_EVENT).toBe("canx:companion-work");
  });

  it("shows a talking-head icon and pulses only while voice is active", () => {
    expect(dockSource).toContain("AssistantFace");
    expect(dockSource).toContain('active ? "animate-pulse motion-reduce:animate-none" : ""');
    expect(isVoiceActive(IDLE_MANAGER_VOICE_STATE)).toBe(false);
    expect(isVoiceActive({ ...IDLE_MANAGER_VOICE_STATE, listening: true })).toBe(true);
    expect(isVoiceActive({ ...IDLE_MANAGER_VOICE_STATE, speaking: true })).toBe(true);
    expect(managerVoiceLabel(IDLE_MANAGER_VOICE_STATE)).toBe("Ready");
    expect(managerVoiceLabel({ ...IDLE_MANAGER_VOICE_STATE, listening: true })).toBe("Listening");
    expect(managerVoiceLabel({ ...IDLE_MANAGER_VOICE_STATE, error: "Microphone blocked" })).toBe("Microphone blocked");
  });

  it("collapses to a restorable edge tab after X", () => {
    expect(dockSource).toContain("canx-companion-tab");
    expect(dockSource).toContain('aria-label="Restore the CanX companion"');
    expect(dockSource).toContain("canx.companion.hidden");
  });

  it("removes the duplicate header ChatGPT shortcut", () => {
    expect(navSource).not.toContain("chatgpt");
    expect(navSource).not.toContain("ChatGPT");
    expect(navSource).not.toContain("COMPANION_OPEN_EVENT");
  });
});

describe("companion position", () => {
  const viewport = { width: 1280, height: 800 };
  const size = { width: 128, height: 128 };

  it("keeps an in-bounds position unchanged", () => {
    expect(clampCompanionPosition({ left: 400, top: 300 }, viewport, size)).toEqual({ left: 400, top: 300 });
  });

  it("clamps off-screen positions back inside the viewport", () => {
    expect(clampCompanionPosition({ left: -200, top: -50 }, viewport, size)).toEqual({ left: 0, top: 0 });
    expect(clampCompanionPosition({ left: 5000, top: 5000 }, viewport, size)).toEqual({ left: 1152, top: 672 });
  });

  it("handles viewports smaller than the control", () => {
    expect(clampCompanionPosition({ left: 50, top: 50 }, { width: 100, height: 100 }, size)).toEqual({
      left: 0,
      top: 0,
    });
  });

  it("reads only a valid saved position", () => {
    expect(COMPANION_POSITION_KEY).toBe("canx.companion.position");
    expect(readStoredPosition(JSON.stringify({ left: 12, top: 34 }))).toEqual({ left: 12, top: 34 });
    expect(readStoredPosition("not json")).toBeNull();
    expect(readStoredPosition(null)).toBeNull();
    expect(readStoredPosition(JSON.stringify({ left: "x", top: 1 }))).toBeNull();
  });
});
