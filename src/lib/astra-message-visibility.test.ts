import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Astra conversation visibility", () => {
  const source = readFileSync("src/components/office/OfficeManager.tsx", "utf8");

  it("scrolls to the latest message instead of the controls below the transcript", () => {
    expect(source).toContain('querySelectorAll<HTMLElement>("[data-astra-message]")');
    expect(source).toContain("data-astra-message={message.role}");
    expect(source).not.toContain("pane.scrollTop = pane.scrollHeight");
  });

  it("does not label a live voice turn unanswered while its reply is pending", () => {
    expect(source).toContain("!pendingVoiceIds.has(message.id)");
  });

  it("shows playback trouble separately from an Office response failure", () => {
    expect(source).toContain("speechError || realtimeManager.playbackError");
    expect(source).toContain("realtimeManager.error || error");
  });
});

describe("Elsie opens at the latest message", () => {
  const source = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
  it("re-enables follow and scrolls to the newest message whenever Elsie opens", () => {
    expect(source).toContain('if (!open || tab !== "now") return;');
    expect(source).toContain("}, [open, tab, messages.length > 0]);");
    expect(source).toContain("pane.scrollHeight - pane.scrollTop - pane.clientHeight < 48");
  });
});
