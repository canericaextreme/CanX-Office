import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AI_WORKERS_VERIFICATION } from "@/routes/_office/subscriptions";
import {
  CHATGPT_URL,
  CHATGPT_WINDOW_NAME,
  openChatGptCompanion,
  resetChatGptCompanionForTests,
} from "./chatgpt-popup";

const subscriptionsSource = readFileSync("src/routes/_office/subscriptions.tsx", "utf8");
const navSource = readFileSync("src/components/office/OfficeNav.tsx", "utf8");

describe("AI Workers subscription verification", () => {
  it("keeps the supplied verified aggregate facts", () => {
    expect(AI_WORKERS_VERIFICATION).toEqual({
      spend: "$0.20",
      monthlyLimit: "$25.00",
      usage: "0.8%",
      status: "Partially verified",
      lastVerified: "September 11, 2026",
      evidence: "OpenAI Platform Usage and API key activity checked September 11, 2026.",
    });
  });

  it("exposes a full keyboard-accessible row and honest provider details", () => {
    expect(subscriptionsSource).toContain('aria-label="Open AI Workers subscription verification details"');
    expect(subscriptionsSource).toContain("Connected, billing not yet verified");
    expect(subscriptionsSource).toContain("Verify Anthropic billing/usage");
    expect(subscriptionsSource).toContain('tone="blue" label="Verified"');
    expect(subscriptionsSource).toContain("Edit verification unavailable");
    expect(subscriptionsSource).not.toMatch(/API key[:=]\s*[A-Za-z0-9_-]{16,}/);
  });
});

describe("global ChatGPT shortcut", () => {
  it("keeps a safe link and clear accessible companion wording", () => {
    expect(navSource).toContain('href="https://chatgpt.com/"');
    expect(navSource).toContain('target="_blank"');
    expect(navSource).toContain('rel="noopener noreferrer"');
    expect(navSource).toContain("Show the CanX ChatGPT companion");
  });

  it("opens and reuses a named, right-aligned desktop companion", () => {
    resetChatGptCompanionForTests();
    const calls: Array<[string | URL | undefined, string | undefined, string | undefined]> = [];
    let focused = 0;
    let replacedWith = "";
    const popup = {
      closed: false,
      focus: () => { focused += 1; },
      opener: {} as Window,
      location: { replace: (url: string) => { replacedWith = url; } },
    };
    const environment = {
      viewportWidth: 1280,
      availableWidth: 1440,
      availableHeight: 900,
      availableLeft: 0,
      availableTop: 0,
      openWindow: (url?: string | URL, target?: string, features?: string) => {
        calls.push([url, target, features]);
        return popup;
      },
    };

    expect(openChatGptCompanion(environment)).toBe("popup");
    expect(calls).toEqual([["", CHATGPT_WINDOW_NAME, expect.stringContaining("width=520,height=760,left=920")]]);
    expect(replacedWith).toBe(CHATGPT_URL);
    expect(popup.opener).toBeNull();
    expect(openChatGptCompanion(environment)).toBe("focused");
    expect(calls).toHaveLength(1);
    expect(focused).toBe(2);
  });

  it("uses a protected normal tab on mobile", () => {
    resetChatGptCompanionForTests();
    const calls: Array<[string | URL | undefined, string | undefined, string | undefined]> = [];
    const tab = { closed: false, focus: () => undefined, opener: null, location: { replace: () => undefined } };
    const result = openChatGptCompanion({
      viewportWidth: 390,
      availableWidth: 390,
      availableHeight: 844,
      availableLeft: 0,
      availableTop: 0,
      openWindow: (url, target, features) => { calls.push([url, target, features]); return tab; },
    });

    expect(result).toBe("tab");
    expect(calls).toEqual([[CHATGPT_URL, "_blank", "noopener,noreferrer"]]);
  });

  it("falls back to a protected normal tab when the companion is blocked", () => {
    resetChatGptCompanionForTests();
    const calls: Array<[string | URL | undefined, string | undefined, string | undefined]> = [];
    const tab = { closed: false, focus: () => undefined, opener: null, location: { replace: () => undefined } };
    const result = openChatGptCompanion({
      viewportWidth: 1280,
      availableWidth: 1440,
      availableHeight: 900,
      availableLeft: 0,
      availableTop: 0,
      openWindow: (url, target, features) => {
        calls.push([url, target, features]);
        return calls.length === 1 ? null : tab;
      },
    });

    expect(result).toBe("tab");
    expect(calls[0]?.[1]).toBe(CHATGPT_WINDOW_NAME);
    expect(calls[1]).toEqual([CHATGPT_URL, "_blank", "noopener,noreferrer"]);
  });
});