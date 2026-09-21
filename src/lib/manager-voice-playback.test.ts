import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SILENT_AUDIO_DATA_URL, playbackRefusalMessage } from "@/lib/use-manager-voice";

const voice = readFileSync(resolve(process.cwd(), "src/lib/use-manager-voice.ts"), "utf8");
const manager = readFileSync(
  resolve(process.cwd(), "src/components/office/OfficeManager.tsx"),
  "utf8",
);

function block(source: string, start: string): string {
  const from = source.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  const rest = source.slice(from);
  const end = rest.indexOf("\n  }, [");
  return end === -1 ? rest.slice(0, 3200) : rest.slice(0, end);
}

describe("Manager playback unlock happens inside the user's tap", () => {
  it("really plays inaudible audio and resumes a playback context, not just creates an element", () => {
    const unlock = block(voice, "const unlockPlayback");
    expect(unlock).toContain("SILENT_AUDIO_DATA_URL");
    expect(unlock).toContain("audio.play()");
    expect(unlock).toContain("audio.muted = true");
    expect(unlock).toContain("playbackContextRef.current = new AudioContextCtor()");
    expect(unlock).toContain("context.resume()");
    expect(SILENT_AUDIO_DATA_URL.startsWith("data:audio/wav;base64,")).toBe(true);
  });

  it("keeps the playback context out of the microphone teardown", () => {
    const release = block(voice, "const releaseRecording");
    expect(release).not.toContain("playbackContextRef");
  });

  it("uses a live media track for the main conversation and keeps the legacy voice test", () => {
    const primary = block(manager, "const primaryVoiceAction");
    expect(primary).toContain("realtimeManager.start()");
    expect(block(manager, 'aria-label="Test the voice with the microphone off"')).toContain(
      "managerVoice.unlockPlayback()",
    );
  });
});

describe("Android-style refusal becomes a visible manual-play state", () => {
  it("keeps the audio, flags a pending play and reports a blocked phase", () => {
    const attempt = block(voice, "const attemptPlayback");
    expect(attempt).toContain("caught instanceof Error && caught.name");
    expect(attempt).toContain("playbackRefusalMessage(name)");
    expect(attempt).toContain("blockedReason: name");
    expect(attempt).toContain("setHasPendingAudio(true)");
    expect(attempt).toContain('setPhase("blocked")');
    expect(voice).toContain('| "blocked"');
  });

  it("explains NotAllowedError in plain words with no provider detail", () => {
    expect(playbackRefusalMessage("NotAllowedError")).toBe(
      "Your phone blocked Data's voice until you tap. Press Play Data's answer to hear it.",
    );
    expect(playbackRefusalMessage("NotSupportedError")).toContain("could not play that voice file");
    expect(playbackRefusalMessage(null)).toContain("Press Play Data's answer");
    for (const name of ["NotAllowedError", "NotSupportedError", null]) {
      expect(playbackRefusalMessage(name)).not.toMatch(/openai|api|token|key/i);
    }
  });

  it("keeps legacy playback diagnostics out of the main conversation control", () => {
    expect(manager).toContain("managerVoice.report.playbackStarted");
    expect(manager).toContain("managerVoice.report.blockedReason");
    const primary = block(manager, "const primaryVoiceAction");
    expect(primary).not.toContain("managerVoice.hasPendingAudio");
    expect(primary).not.toContain("Play Data's answer");
  });

  it("keeps the written answer regardless of sound", () => {
    const speak = block(manager, "const speakAnswer");
    expect(speak).not.toContain("setMessages");
    expect(speak).toContain("The written answer is still available");
  });
});

describe("Manual playback reuses the buffered audio", () => {
  it("can replay stored legacy test audio without another voice request", () => {
    const pending = block(voice, "const playPendingAudio");
    expect(pending).toContain("unlockPlayback()");
    expect(pending).toContain("attemptPlayback()");
    const attempt = block(voice, "const attemptPlayback");
    expect(attempt).toContain("bufferedRef.current");
    expect(attempt).not.toContain("fetch(");
    expect(voice).not.toContain("speakManagerText");
    const button = block(manager, "const primaryVoiceAction");
    expect(button).toContain("realtimeManager.start()");
    expect(button).not.toContain("requestSpeech");
  });

  it("stores the generated audio once, before attempting playback", () => {
    const play = block(voice, "const playAudio = useCallback");
    expect(play.indexOf("bufferedRef.current =")).toBeLessThan(play.indexOf("attemptPlayback()"));
  });
});

describe("Microphone and playback never overlap", () => {
  it("releases microphone tracks before playback starts", () => {
    const attempt = block(voice, "const attemptPlayback");
    expect(attempt.indexOf("releaseRecording()")).toBeLessThan(attempt.indexOf("audio.play()"));
    expect(voice).toContain("getTracks().forEach((track) => track.stop())");
  });

  it("resumes listening only when playback has actually ended", () => {
    const attempt = block(voice, "const attemptPlayback");
    const ended = attempt.slice(attempt.indexOf("audio.onended"));
    expect(ended).toContain("buffered.onEnded?.()");
    expect(attempt.indexOf("buffered.onEnded?.()")).toBeGreaterThan(
      attempt.indexOf("audio.onended"),
    );
    expect(manager).toContain("void speakAnswer(answerId, spoken, resumeListening)");
  });
});

describe("ChatGPT companion and realtime voice stay separate", () => {
  it("shares no realtime pipeline with the Manager voice path", () => {
    for (const source of [voice, manager]) {
      expect(source).not.toContain("use-realtime-chat");
      expect(source).not.toContain("realtime-voice.functions");
      expect(source).not.toContain("CompanionDock");
    }
  });
});
