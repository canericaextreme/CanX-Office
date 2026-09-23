import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manager = readFileSync(
  resolve(process.cwd(), "src/components/office/OfficeManager.tsx"),
  "utf8",
);
const voice = readFileSync(resolve(process.cwd(), "src/lib/use-manager-voice.ts"), "utf8");
const endpoints = readFileSync(
  resolve(process.cwd(), "src/lib/manager-voice.functions.ts"),
  "utf8",
);

describe("Office Manager voice — portable recording and playback", () => {
  it("offers a voice check with a microphone-off test sentence", () => {
    expect(manager).toContain("Voice check");
    expect(manager).toContain("VOICE_CHECK_SENTENCE");
    expect(manager).toContain("Test voice (microphone off)");
  });

  it("reports actual recording and audio playback events", () => {
    expect(manager).toContain("managerVoice.report.recorded");
    expect(manager).toContain("managerVoice.report.playbackStarted");
    expect(manager).toContain("managerVoice.report.playbackEnded");
    expect(voice).toContain("audio.onplay");
    expect(voice).toContain("audio.onended");
  });

  it("uses MediaRecorder for listening and keeps device speech as an output fallback", () => {
    expect(voice).toContain("new MediaRecorder");
    expect(voice).toContain('document.createElement("audio")');
    expect(manager).not.toContain("useDictation");
    expect(manager).not.toContain("useReadAloud");
    expect(voice).toContain("speechSynthesis.speak(utterance)");
  });
});

describe("Office Manager voice — serialized turn lifecycle", () => {
  it("presents one primary voice control and hides expert controls", () => {
    expect(manager).toContain("const primaryVoiceAction");
    expect(manager).toContain('Talk to Astra');
    expect(manager).toContain("The microphone stays open");
    expect(manager).not.toContain("Read aloud");
    expect(manager).not.toContain("Repeat answer");
    expect(manager).not.toContain("Voice options");
    expect(manager).not.toContain("Review with Claude");
  });

  it("releases microphone tracks before audio playback", () => {
    const playback = voice.slice(voice.indexOf("const attemptPlayback"));
    expect(playback.indexOf("releaseRecording()")).toBeLessThan(playback.indexOf("audio.play()"));
    expect(voice).toContain("getTracks().forEach((track) => track.stop())");
  });

  it("records a complete file and stops after bounded silence or time", () => {
    expect(voice).toContain("recorder.start()");
    expect(voice).not.toMatch(/recorder\.start\(\s*\d/);
    expect(voice).toContain("Date.now() - quietSince > 1400");
    expect(voice).toContain("MAX_RECORDING_MS");
  });

  it("transcribes, sends the existing Manager request, speaks, then listens again", () => {
    expect(manager).toContain("requestTranscription");
    expect(manager).toContain("await sendRef.current(result.text)");
    expect(manager).toContain("requestSpeech");
    expect(manager).toContain("managerVoice.playAudio");
    expect(manager).toContain("void speakAnswer(answerId, spoken, resumeListening)");
  });

  it("speaks with the device voice when hosted speech fails", () => {
    expect(manager).toContain("managerVoice.speakLocally(text");
    expect(voice).toContain("const speakLocally");
    expect(voice).toContain('utterance.lang = "en-CA"');
    expect(voice).toContain("onEnded?.()");
  });
});

describe("Office Manager voice — bounded, ephemeral server audio", () => {
  it("falls back to the documented low-latency speech model on model refusal", () => {
    expect(endpoints).toContain("response.status === 403 || response.status === 404");
    expect(endpoints).toContain('requestSpeech("tts-1")');
    expect(endpoints).toContain('model === "tts-1" ? {}');
  });

  it("requires owner sign-in with authenticator and uses the existing server-only OpenAI key", () => {
    expect(endpoints).toContain("verifyOwnerWith");
    expect(endpoints).toContain('process.env["OPENAI_API_KEY"]');
    expect(endpoints).toContain("reserveAiCallWith");
    expect(endpoints).toContain("settleAiCallWith");
  });

  it("bounds recordings and spoken text without saving audio", () => {
    expect(endpoints).toContain("MAX_AUDIO_BYTES");
    expect(endpoints).toContain("MAX_SPEECH_CHARS");
    expect(voice).toContain("URL.revokeObjectURL");
    expect(endpoints).not.toContain("supabaseAdmin");
    expect(endpoints).not.toContain("storage.from");
  });

  it("surfaces recording, provider and playback failures", () => {
    expect(manager).toContain("The Manager could not understand that recording");
    expect(manager).toContain("Astra could not start a spoken answer");
    expect(voice).toContain("Your phone blocked Astra's voice");
    expect(voice).toContain("Microphone access is needed");
  });
});

describe("Office Manager voice audit — nothing else changed", () => {
  it("keeps the Manager off the Chat realtime pipeline", () => {
    expect(manager).not.toContain("use-realtime-chat");
    expect(manager).not.toContain("realtime-voice.functions");
  });
});
