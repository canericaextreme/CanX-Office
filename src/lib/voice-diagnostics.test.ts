import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { clearVoiceDiag, isPrivatePreview, readVoiceDiag, recordVoiceDiag, summarizeVoiceDiag, summarizeVoiceStages } from "./voice-diagnostics";

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
  it("Standard voice records the provider-to-transcript and Office-model phases", () => {
    const hook = readFileSync("src/lib/use-realtime-manager.ts", "utf8");
    expect(hook).toContain('"speech end to transcript"');
    expect(hook).toContain('"office request to answer"');
    expect(hook).toContain('"end of speech to first sound"');
    expect(hook).not.toContain("recordVoiceDiag(\"latency\", sessionMode, text");
  });
  it("is limited to private preview hosts", () => {
    expect(isPrivatePreview("id-preview--abc.lovable.app")).toBe(true);
    expect(isPrivatePreview("localhost")).toBe(true);
    expect(isPrivatePreview("canx-office.lovable.app")).toBe(false);
  });
});


describe("stage-specific voice measurements", () => {
  it("never mixes fast transcription or another mode into the response-delay median", () => {
    const sample = (detail: string, ms: number, mode = "relay") => ({ id: ms, at: 0, kind: "latency" as const, mode, detail, ms });
    const rows = summarizeVoiceStages([
      sample("speech end to transcript", 100), sample("office request to answer", 1200),
      sample("end of speech to first sound", 8000), sample("end of speech to first sound", 10000),
      sample("end of speech to first sound", 1000, "direct"), sample("unknown", 1),
      sample("end of speech to first sound", Number.NaN),
    ]);
    expect(rows).toHaveLength(4);
    expect(rows.find(r => r.mode === "relay" && r.stage.includes("provider audio"))).toMatchObject({samples: 2, medianMs: 9000, p95Ms: 10000});
  });
  it("uses nearest-rank p95 and counts only valid measurements", () => {
    const samples = Array.from({length: 20}, (_, i) => ({id: i, at: 0, kind: "latency" as const, mode: "relay", detail: "office request to answer", ms: (i + 1) * 100}));
    expect(summarizeVoiceStages(samples)[0]).toMatchObject({samples: 20, medianMs: 1050, p95Ms: 1900, worstMs: 2000});
    expect(summarizeVoiceStages([{...samples[0]!, ms: -10}])).toEqual([]);
  });
});
