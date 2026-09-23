import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the hook's async media lifecycle with deterministic browser APIs.
// State is captured directly; no browser permissions or paid services are used.
const hooks = vi.hoisted(() => ({ states: [] as unknown[], cleanups: [] as (() => void)[] }));
vi.mock("react", () => ({
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
  useState: (initial: unknown) => {
    const index = hooks.states.push(initial) - 1;
    return [initial, (value: unknown) => {
      hooks.states[index] = typeof value === "function" ? value(hooks.states[index]) : value;
    }];
  },
  useEffect: (effect: () => (() => void) | void) => {
    const cleanup = effect();
    if (cleanup) hooks.cleanups.push(cleanup);
  },
}));
import { SILENT_AUDIO_DATA_URL, useManagerVoice } from "./use-manager-voice";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
class Recorder {
  static isTypeSupported() { return true; }
  static latest: Recorder;
  state = "inactive";
  mimeType = "audio/mp4";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => Promise<void> | void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { Recorder.latest = this; }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array(300)]) });
    void this.onstop?.();
  }
}
let audio: {
  src: string; muted: boolean; currentTime: number; style: Record<string, string>;
  onplay: (() => void) | null; onended: (() => void) | null; onerror: (() => void) | null;
  play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>;
  setAttribute: ReturnType<typeof vi.fn>; removeAttribute: ReturnType<typeof vi.fn>;
};
let stopTrack: ReturnType<typeof vi.fn>;
let getUserMedia: ReturnType<typeof vi.fn>;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.useFakeTimers();
  hooks.states = []; hooks.cleanups = [];
  stopTrack = vi.fn();
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  audio = {
    src: "", muted: false, currentTime: 0, style: {}, onplay: null, onended: null, onerror: null,
    play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), load: vi.fn(), remove: vi.fn(),
    setAttribute: vi.fn(), removeAttribute: vi.fn(() => { audio.src = ""; }),
  };
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", { createElement: () => audio, body: { appendChild: vi.fn() } });
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("FileReader", class {
    result = "data:audio/mp4;base64,YXVkaW8=";
    onload: (() => void) | null = null;
    readAsDataURL() { this.onload?.(); }
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:answer");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  hooks.cleanups.forEach((cleanup) => cleanup());
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("Astra voice lifecycle", () => {
  it("cancels a recording without transcribing or sending it", async () => {
    const onTurn = vi.fn(); const voice = useManagerVoice(onTurn);
    await voice.startListening();
    voice.cancelListening(); await flush();
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(onTurn).not.toHaveBeenCalled();
    expect(Recorder.latest.state).toBe("inactive");
    expect(hooks.states[0]).toBe("idle");
  });
  it("still submits an explicitly finished recording once", async () => {
    const onTurn = vi.fn().mockResolvedValue(undefined); const voice = useManagerVoice(onTurn);
    await voice.startListening(); voice.stopListening(); await flush();
    expect(onTurn).toHaveBeenCalledExactlyOnceWith("YXVkaW8=", "audio/mp4");
    expect(stopTrack).toHaveBeenCalledOnce();
  });
  it("does not reopen the microphone after permission resolves following cancellation", async () => {
    const permission = deferred<MediaStream>(); getUserMedia.mockReturnValue(permission.promise);
    const voice = useManagerVoice(vi.fn());
    const first = voice.startListening(); const second = voice.startListening();
    expect(getUserMedia).toHaveBeenCalledOnce();
    voice.cancelListening();
    permission.resolve({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream);
    await Promise.all([first, second]);
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(hooks.states[0]).toBe("idle");
  });
  it("discards an encoded recording if the session was cancelled before submission", async () => {
    const onTurn = vi.fn(); const voice = useManagerVoice(onTurn);
    await voice.startListening(); voice.stopListening(); voice.cancelListening(); await flush();
    expect(onTurn).not.toHaveBeenCalled();
  });
  it("ignores a late playback rejection after Stop", async () => {
    const playback = deferred<void>(); audio.play.mockReturnValue(playback.promise);
    const voice = useManagerVoice(vi.fn()); const result = voice.playAudio("YXVkaW8=");
    voice.stopPlayback(); playback.reject(new DOMException("Blocked", "NotAllowedError"));
    expect(await result).toBe(false);
    expect(hooks.states[0]).toBe("idle"); expect(hooks.states[3]).toBe(false);
  });
  it("does not restart listening from a stale ended event after interruption", async () => {
    const ended = vi.fn(); const voice = useManagerVoice(vi.fn());
    await voice.playAudio("YXVkaW8=", "audio/mpeg", ended);
    const oldEnded = audio.onended; voice.stopPlayback(); oldEnded?.();
    expect(ended).not.toHaveBeenCalled();
  });
  it("replays a browser-blocked answer without asking for new audio", async () => {
    audio.play.mockRejectedValueOnce(new DOMException("Blocked", "NotAllowedError"));
    const ended = vi.fn(); const voice = useManagerVoice(vi.fn());
    expect(await voice.playAudio("YXVkaW8=", "audio/mpeg", ended)).toBe(false);
    expect(hooks.states[3]).toBe(true);
    expect(await voice.playPendingAudio()).toBe(true);
    expect(audio.play).toHaveBeenCalledTimes(2);
    audio.onended?.(); expect(ended).toHaveBeenCalledOnce();
    expect(hooks.states[3]).toBe(false);
  });
  it("does not let delayed audio unlocking pause the spoken answer", async () => {
    const priming = deferred<void>(); audio.play.mockReturnValueOnce(priming.promise);
    const voice = useManagerVoice(vi.fn()); voice.unlockPlayback();
    await voice.playAudio("YXVkaW8="); const pauses = audio.pause.mock.calls.length;
    priming.resolve(); await flush();
    expect(audio.pause).toHaveBeenCalledTimes(pauses); expect(audio.muted).toBe(false);
  });
  it("unlocks with a WAV that contains real samples", () => {
    const wav = Buffer.from(SILENT_AUDIO_DATA_URL.split(",")[1]!, "base64");
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(40)).toBeGreaterThan(0);
    expect(wav.readUInt32LE(40)).toBe(wav.length - 44);
  });
});
