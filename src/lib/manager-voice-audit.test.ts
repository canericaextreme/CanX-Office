import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manager = readFileSync(resolve(process.cwd(), "src/components/office/OfficeManager.tsx"), "utf8");
const speech = readFileSync(resolve(process.cwd(), "src/lib/use-speech.ts"), "utf8");

describe("Office Manager voice audit — evidence panel", () => {
  it("offers a voice check with a microphone-off test sentence", () => {
    expect(manager).toContain("Voice check");
    expect(manager).toContain("VOICE_CHECK_SENTENCE");
    expect(manager).toContain("Test voice (microphone off)");
  });

  it("reports what the device's speech engine actually did", () => {
    expect(manager).toContain("readAloud.report.started");
    expect(manager).toContain("readAloud.report.ended");
    expect(manager).toContain("readAloud.report.errorCode");
    expect(manager).toContain("readAloud.report.voiceCount");
  });

  it("the speech helper records start, finish and error evidence", () => {
    expect(speech).toContain("SpeechReport");
    expect(speech).toContain("started: true");
    expect(speech).toContain("ended: true");
    expect(speech).toContain("errorCode");
    expect(speech).toMatch(/report\s*}/);
  });
});

describe("Office Manager voice audit — listening and speaking never overlap", () => {
  it("closes the microphone before speaking", () => {
    const speakAnswer = manager.slice(manager.indexOf("const speakAnswer"));
    const body = speakAnswer.slice(0, speakAnswer.indexOf("readAloud.speak("));
    expect(body).toContain("dictation.stop()");
  });

  it("does not reopen the microphone at the moment an answer is spoken", () => {
    expect(manager).not.toContain("resumeListening(0);\n            if (approvalLine)");
    expect(manager).not.toMatch(/dictation\.start\(\);\s*\n\s*speakAnswer\(`greeting/);
  });

  it("speaks the greeting first and listens once it has finished", () => {
    expect(manager).toMatch(/speakAnswer\(`greeting-\$\{Date\.now\(\)\}`, VOICE_GREETING, \(\) => resumeListening\(200\)\)/);
  });
});

describe("Office Manager voice audit — honest silence", () => {
  it("tells John when the phone played nothing instead of staying silent", () => {
    expect(manager).toContain("readAloud.didSpeak()");
    expect(manager).toContain("Your phone did not play the answer aloud");
    expect(manager).toContain("{speechError}");
  });

  it("starts the first piece inside the button press rather than on a timer", () => {
    expect(speech).not.toContain("setTimeout(() => speakChunk(0), 90)");
    expect(speech).toMatch(/\n\s*speakChunk\(0\);/);
  });
});

describe("Office Manager voice audit — nothing else changed", () => {
  it("keeps the Manager off the Chat realtime pipeline", () => {
    expect(manager).not.toContain("use-realtime-chat");
    expect(manager).not.toContain("realtime-voice.functions");
  });
});
