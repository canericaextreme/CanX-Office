import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHATGPT_URL,
  CHATGPT_WINDOW_NAME,
  CHATGPT_WORK_WINDOW_NAME,
  COMPANION_OPEN_EVENT,
  openChatGptCompanion,
  resetChatGptCompanionForTests,
} from "./chatgpt-popup";

const dockSource = readFileSync("src/components/office/CompanionDock.tsx", "utf8");
const navSource = readFileSync("src/components/office/OfficeNav.tsx", "utf8");
const layoutSource = readFileSync("src/routes/_office.tsx", "utf8");

function fakeEnvironment() {
  const calls: Array<[string | URL | undefined, string | undefined, string | undefined]> = [];
  const popup = {
    closed: false,
    focus: () => undefined,
    opener: {} as Window,
    location: { replace: (_url: string) => undefined },
  };
  return {
    calls,
    environment: {
      viewportWidth: 1440,
      availableWidth: 1680,
      availableHeight: 1000,
      availableLeft: 0,
      availableTop: 0,
      openWindow: (url?: string | URL, target?: string, features?: string) => {
        calls.push([url, target, features]);
        return popup;
      },
    },
  };
}

describe("compact CanX companion", () => {
  it("is mounted in the office layout beside, not inside, the Office Manager", () => {
    expect(layoutSource).toContain("<CompanionDock />");
    expect(layoutSource).toContain("<OfficeManager />");
  });

  it("uses a compact square footprint that does not block navigation", () => {
    expect(dockSource).toContain("h-28 w-28");
    expect(dockSource).toContain("sm:h-32 sm:w-32");
    expect(dockSource).toContain("fixed bottom-4 left-4");
  });

  it("shows a blue activity dot and never renders transcript text", () => {
    expect(dockSource).toContain("bg-canx-blue");
    expect(dockSource).not.toMatch(/messages|transcript|interimTranscript/);
  });

  it("labels Chat, Work and close controls for keyboard and screen readers", () => {
    expect(dockSource).toContain('aria-label="CanX ChatGPT companion"');
    expect(dockSource).toContain('aria-label="Open a quick ChatGPT chat window beside the office"');
    expect(dockSource).toContain('aria-label="Open a larger ChatGPT work window for a substantial task"');
    expect(dockSource).toContain('aria-label="Close the CanX ChatGPT companion"');
    expect(dockSource).toContain("min-h-9");
    expect(dockSource).toContain(">Chat<");
    expect(dockSource).toContain(">Work<");
  });

  it("closes to hidden state and reopens from the global header shortcut", () => {
    expect(dockSource).toContain(COMPANION_OPEN_EVENT);
    expect(dockSource).toContain("canx.companion.hidden");
    expect(navSource).toContain("COMPANION_OPEN_EVENT");
    expect(navSource).toContain("Show the CanX ChatGPT companion");
  });

  it("opens the quick chat window for Chat", () => {
    resetChatGptCompanionForTests();
    const { calls, environment } = fakeEnvironment();
    expect(openChatGptCompanion(environment, "chat")).toBe("popup");
    expect(calls[0][1]).toBe(CHATGPT_WINDOW_NAME);
    expect(calls[0][2]).toContain("width=520");
  });

  it("opens a separate, larger work window for Work", () => {
    resetChatGptCompanionForTests();
    const { calls, environment } = fakeEnvironment();
    expect(openChatGptCompanion(environment, "work")).toBe("popup");
    expect(calls[0][1]).toBe(CHATGPT_WORK_WINDOW_NAME);
    expect(calls[0][2]).toContain("width=960");
  });

  it("keeps the real ChatGPT site and never embeds it", () => {
    expect(CHATGPT_URL).toBe("https://chatgpt.com/");
    expect(dockSource).not.toContain("iframe");
  });
});
