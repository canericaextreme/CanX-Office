import { describe, expect, it, beforeEach } from "vitest";
import { clearVoiceDiag, isPrivatePreview, readVoiceDiag, recordVoiceDiag, summarizeVoiceDiag } from "./voice-diagnostics";

describe("voice diagnostics", () => {
  beforeEach(() => clearVoiceDiag());
  it("summarizes failures, interruptions, fallbacks and latency", () => {
    recordVoiceDiag("latency", "relay", "x", 900);
    recordVoiceDiag("latency", "relay", "x", 2100);
    recordVoiceDiag("latency", "direct", "x", 1200);
    recordVoiceDiag("failure", "relay", "provider rate_limit_exceeded");
    recordVoiceDiag("interruption", "direct", "spoke over Astra");
    recordVoiceDiag("fallback", "fallback", "switched");
    expect(summarizeVoiceDiag(readVoiceDiag())).toEqual({ failures: 1, interruptions: 1, fallbacks: 1, medianMs: 1200, worstMs: 2100 });
  });
  it("strips unsafe characters and caps size", () => {
    recordVoiceDiag("failure", "relay", "<script>" + "a".repeat(200));
    expect(readVoiceDiag()[0]!.detail).not.toContain("<");
    expect(readVoiceDiag()[0]!.detail.length).toBeLessThanOrEqual(80);
    for (let i = 0; i < 100; i++) recordVoiceDiag("connected", "relay", "ok");
    expect(readVoiceDiag().length).toBe(60);
  });
  it("is limited to private preview hosts", () => {
    expect(isPrivatePreview("id-preview--abc.lovable.app")).toBe(true);
    expect(isPrivatePreview("localhost")).toBe(true);
    expect(isPrivatePreview("canx-office.lovable.app")).toBe(false);
  });
});
