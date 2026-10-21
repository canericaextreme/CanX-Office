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
vi.mock("./manager-realtime.functions", () => ({ createManagerRealtimeSession: {}, refreshManagerVoiceContext: {} }));
vi.mock("./use-realtime-chat", () => ({ realtimeEventPhase: () => "listening" }));
import { isQuickReplyEcho, QUICK_REPLY_DELAY_MS, QUICK_REPLY_LINES, useRealtimeManager } from "./use-realtime-manager";
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
class Peer {
  static instances: Peer[] = [];
  ontrack: ((event: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState = "connected";
  iceGatheringState: RTCIceGatheringState = "complete";
  localDescription = { sdp: "offer-with-candidates" };
  channel = { readyState: "open", send: vi.fn(), onmessage: null as ((event: { data: string }) => void) | null, onclose: null as (() => void) | null, onopen: null as (() => void) | null, close: vi.fn() };
  close = vi.fn(); addTrack = vi.fn();
  addEventListener = vi.fn(); removeEventListener = vi.fn();
  createDataChannel = () => this.channel;
  createOffer = vi.fn().mockResolvedValue({ sdp: "offer" });
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);
  constructor() { Peer.instances.push(this); }
}
beforeEach(() => {
  vi.useFakeTimers(); hooks.states = []; hooks.cleanups = []; Peer.instances = [];
  hooks.mint.mockReset().mockResolvedValue({ ok: true, clientSecret: "ephemeral-test", model: "test" });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) } });
  vi.stubGlobal("document", { visibilityState: "visible", createElement: () => ({ play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), remove: vi.fn(), setAttribute: vi.fn(), style: {} }), body: { appendChild: vi.fn() }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("RTCPeerConnection", Peer);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("answer")));
});
afterEach(() => { hooks.cleanups.forEach((cleanup) => cleanup()); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function useVoice(action: (request: string) => Promise<string>) {
  const transcript = vi.fn();
  const voice = useRealtimeManager("token", [], transcript, action); voice.start(); await flush();
  const channel = Peer.instances[0]!.channel;
  const emit = (data: unknown) => channel.onmessage?.({ data: JSON.stringify(data) });
  const sent = () => channel.send.mock.calls.map(c => JSON.parse(String(c[0])) as { type: string; response?: { instructions?: string; metadata?: Record<string, string> } });
  return { transcript, emit, sent };
}
const ask = (emit: (d: unknown) => void, id: string, words: string) => {
  emit({ type: "input_audio_buffer.committed", item_id: id });
  emit({ type: "conversation.item.input_audio_transcription.completed", item_id: id, transcript: words });
};

describe("Elsie's quick spoken reply while the Office works (21 Oct, ~8 s of silence)", () => {
  it("says a fixed short line when the Office is slow, then the real answer after it", async () => {
    const office = deferred<string>();
    const { emit, sent } = await useVoice(() => office.promise);
    ask(emit, "u1", "What is on the Work Board?");
    await flush();
    expect(sent()).toHaveLength(0);
    vi.advanceTimersByTime(QUICK_REPLY_DELAY_MS);
    expect(sent()).toHaveLength(1);
    const quick = sent()[0]!;
    expect(quick.response?.metadata).toEqual({ elsie_quick_reply: "true" });
    expect(QUICK_REPLY_LINES.some(line => quick.response?.instructions?.includes(line))).toBe(true);
    emit({ type: "response.created", response: { id: "q1", metadata: { elsie_quick_reply: "true" } } });
    emit({ type: "output_audio_buffer.started", response_id: "q1" });
    office.resolve("Three tasks are open.");
    await flush();
    // The answer never talks over the quick line.
    expect(sent()).toHaveLength(1);
    emit({ type: "output_audio_buffer.stopped", response_id: "q1" });
    expect(sent()).toHaveLength(2);
    expect(sent()[1]!.response?.instructions).toContain("Three tasks are open.");
  });

  it("skips the quick line when the Office answers fast", async () => {
    const { emit, sent } = await useVoice(async () => "Opened Finance.");
    ask(emit, "u1", "Open Finance");
    await flush();
    vi.advanceTimersByTime(QUICK_REPLY_DELAY_MS * 3);
    expect(sent()).toHaveLength(1);
    expect(sent()[0]!.response?.metadata).toBeUndefined();
    expect(sent()[0]!.response?.instructions).toContain("Opened Finance.");
  });

  it("never treats Elsie's own quick line, heard by the microphone, as a new request", async () => {
    const office = deferred<string>();
    const action = vi.fn(() => office.promise);
    const { emit, sent, transcript } = await useVoice(action);
    ask(emit, "u1", "Any new receipts?");
    await flush();
    vi.advanceTimersByTime(QUICK_REPLY_DELAY_MS);
    emit({ type: "response.created", response: { id: "q1", metadata: { elsie_quick_reply: "true" } } });
    emit({ type: "output_audio_buffer.started", response_id: "q1" });
    ask(emit, "u2", "Okay, checking.");
    await flush();
    expect(action).toHaveBeenCalledTimes(1);
    expect(sent().some(e => e.type === "response.cancel")).toBe(false);
    expect(transcript).not.toHaveBeenCalledWith("user", "Okay, checking.", "u2");
    emit({ type: "output_audio_buffer.stopped", response_id: "q1" });
    office.resolve("No new receipts.");
    await flush();
    expect(sent().at(-1)!.response?.instructions).toContain("No new receipts.");
  });

  it("still speaks the answer if the quick line never plays", async () => {
    const office = deferred<string>();
    const { emit, sent } = await useVoice(() => office.promise);
    ask(emit, "u1", "Status please");
    await flush();
    vi.advanceTimersByTime(QUICK_REPLY_DELAY_MS);
    office.resolve("All quiet.");
    await flush();
    expect(sent()).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(sent().at(-1)!.response?.instructions).toContain("All quiet.");
  });

  it("recognises only the short checking words as an echo", () => {
    for (const line of QUICK_REPLY_LINES) expect(isQuickReplyEcho(line)).toBe(true);
    expect(isQuickReplyEcho("Okay.")).toBe(true);
    expect(isQuickReplyEcho("Okay, check the Finance room")).toBe(false);
    expect(isQuickReplyEcho("Stop")).toBe(false);
  });
});
