import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_LIVE_VOICE_MODE } from "./use-realtime-manager";

describe("Elsie's default voice mode", () => {
  // 21 Oct: John chose the natural voice after Standard sounded robotic.
  it("starts in the natural voice, which checks the Office for facts", () => {
    expect(DEFAULT_LIVE_VOICE_MODE).toBe("direct");
  });

  it("is the mode a new conversation starts in, with the preview still selectable", () => {
    const manager = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
    expect(manager).toContain('useState<"relay" | "direct">(DEFAULT_LIVE_VOICE_MODE)');
    expect(manager).toContain('onClick={() => setLiveVoiceMode("direct")}');
  });
});
