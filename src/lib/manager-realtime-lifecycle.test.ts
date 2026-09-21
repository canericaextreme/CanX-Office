import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({ states: [] as unknown[], cleanups: [] as (() => void)[], mint: vi.fn() }));
vi.mock("react", () => ({
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
  useState: (initial: unknown) => {
    const index = hooks.states.push(initial) - 1;
    return [initial, (value: unknown) => { hooks.states[index] = value; }];
  },
  useEffect: (effect: () => (() => void) | void) => {
    const cleanup = effect(); if (cleanup) hooks.cleanups.push(cleanup);
  },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => hooks.mint }));
vi.mock("./manager-realtime.functions", () => ({ createManagerRealtimeSession: {} }));
vi.mock("./use-realtime-chat", () => ({ realtimeEventPhase: () => "listening" }));
import { useRealtimeManager } from "./use-realtime-manager";
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
let stopTrack: ReturnType<typeof vi.fn>;
let getUserMedia: ReturnType<typeof vi.fn>;
let audio: { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; setAttribute: ReturnType<typeof vi.fn>; style: Record<string, string> };
class Peer {
  static instances: Peer[] = [];
  ontrack: ((event: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState = "connected";
  channel = { onmessage: null as ((event: { data: string }) => void) | null, onclose: null as (() => void) | null, close: vi.fn() };
  close = vi.fn(); addTrack = vi.fn();
  createDataChannel = () => this.channel;
  createOffer = vi.fn().mockResolvedValue({ sdp: "offer" });
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);
  constructor() { Peer.instances.push(this); }
}
beforeEach(() => {
  vi.useFakeTimers(); hooks.states = []; hooks.cleanups = []; Peer.instances = [];
  stopTrack = vi.fn();
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  hooks.mint.mockReset().mockResolvedValue({ ok: true, clientSecret: "ephemeral-test", model: "test" });
  audio = { play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), remove: vi.fn(), setAttribute: vi.fn(), style: {} };
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("document", { createElement: () => audio, body: { appendChild: vi.fn() } });
  vi.stubGlobal("RTCPeerConnection", Peer);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("answer")));
});
afterEach(() => {
  hooks.cleanups.forEach((cleanup) => cleanup()); vi.useRealTimers(); vi.unstubAllGlobals();
});
describe("Data realtime connection lifecycle", () => {
  it("stops a microphone granted after End without minting a session", async () => {
    const pending = deferred<unknown>(); getUserMedia.mockReturnValue(pending.promise);
    const voice = useRealtimeManager("token", [], vi.fn());
    voice.start(); voice.start(); expect(getUserMedia).toHaveBeenCalledOnce();
    voice.stop(); pending.resolve({ getTracks: () => [{ stop: stopTrack }] }); await flush();
    expect(stopTrack).toHaveBeenCalledOnce(); expect(hooks.mint).not.toHaveBeenCalled();
    expect(hooks.states[0]).toBe("idle"); expect(Peer.instances).toHaveLength(0);
  });
  it("ignores a session minted after Close", async () => {
    const pending = deferred<unknown>(); hooks.mint.mockReturnValue(pending.promise);
    const voice = useRealtimeManager("token", [], vi.fn()); voice.start(); await flush(); voice.stop();
    pending.resolve({ ok: true, clientSecret: "late", model: "test" }); await flush();
    expect(Peer.instances).toHaveLength(0); expect(hooks.states[0]).toBe("idle");
  });
  it("ignores a delayed SDP answer after End", async () => {
    const pending = deferred<Response>(); vi.mocked(fetch).mockReturnValue(pending.promise);
    const voice = useRealtimeManager("token", [], vi.fn()); voice.start(); await flush(); voice.stop();
    pending.resolve(new Response("late answer")); await flush();
    expect(Peer.instances[0]!.setRemoteDescription).not.toHaveBeenCalled();
    expect(hooks.states[0]).toBe("idle"); expect(stopTrack).toHaveBeenCalledOnce();
  });
  it("retries blocked sound on the same connection without minting again", async () => {
    const voice = useRealtimeManager("token", [], vi.fn()); voice.start(); await flush();
    audio.play.mockRejectedValueOnce(new Error("blocked"));
    Peer.instances[0]!.ontrack?.({ streams: [{}] }); await flush(); expect(hooks.states[3]).toBe(true);
    voice.resumeAudio(); await flush(); expect(hooks.states[3]).toBe(false);
    expect(hooks.mint).toHaveBeenCalledOnce(); expect(audio.play).toHaveBeenCalledTimes(2);
  });
  it("closes a failed provider session and never displays provider error details", async () => {
    const voice = useRealtimeManager("token", [], vi.fn()); voice.start(); await flush();
    Peer.instances[0]!.channel.onmessage?.({ data: JSON.stringify({ type: "error", error: { message: "secret details" } }) });
    expect(stopTrack).toHaveBeenCalledOnce(); expect(hooks.states[1]).toBe(false);
    expect(hooks.states[2]).not.toContain("secret details");
  });
  it("times out a stuck connection and discards later microphone permission", async () => {
    const pending = deferred<unknown>(); getUserMedia.mockReturnValue(pending.promise);
    const voice = useRealtimeManager("token", [], vi.fn()); voice.start();
    vi.advanceTimersByTime(30_000); expect(hooks.states[0]).toBe("error");
    pending.resolve({ getTracks: () => [{ stop: stopTrack }] }); await flush();
    expect(stopTrack).toHaveBeenCalledOnce(); expect(hooks.mint).not.toHaveBeenCalled();
  });
  it("ignores transcripts from a closed connection", async () => {
    const transcript = vi.fn(); const voice = useRealtimeManager("token", [], transcript);
    voice.start(); await flush(); const stale = Peer.instances[0]!.channel.onmessage;
    voice.stop(); stale?.({ data: JSON.stringify({ type: "response.audio_transcript.done", transcript: "late" }) });
    expect(transcript).not.toHaveBeenCalled(); expect(hooks.states[0]).toBe("idle");
  });
});
