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
import { useRealtimeManager } from "./use-realtime-manager";
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
let stopTrack: ReturnType<typeof vi.fn>;
let getUserMedia: ReturnType<typeof vi.fn>;
let pageEvents: EventTarget;
let windowEvents: EventTarget;
let audio: { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; setAttribute: ReturnType<typeof vi.fn>; style: Record<string, string> };
class Peer {
  static instances: Peer[] = [];
  ontrack: ((event: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState = "connected";
  channel = { readyState: "open", send: vi.fn(), onmessage: null as ((event: { data: string }) => void) | null, onclose: null as (() => void) | null, onopen: null as (() => void) | null, close: vi.fn() };
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
  pageEvents = new EventTarget(); windowEvents = new EventTarget();
  vi.stubGlobal("document", { visibilityState: "visible", createElement: () => audio, body: { appendChild: vi.fn() },
    addEventListener: pageEvents.addEventListener.bind(pageEvents), removeEventListener: pageEvents.removeEventListener.bind(pageEvents) });
  vi.stubGlobal("window", { addEventListener: windowEvents.addEventListener.bind(windowEvents), removeEventListener: windowEvents.removeEventListener.bind(windowEvents) });
  vi.stubGlobal("RTCPeerConnection", Peer);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("answer")));
});
afterEach(() => {
  hooks.cleanups.forEach((cleanup) => cleanup()); vi.useRealTimers(); vi.unstubAllGlobals();
});
describe("Astra realtime connection lifecycle", () => {
  it("keeps connecting after SDP until the event channel opens", async () => {
    const answer = deferred<Response>(); vi.mocked(fetch).mockReturnValue(answer.promise);
    useRealtimeManager("token", [], vi.fn()).start(); await flush();
    const channel = Peer.instances[0]!.channel; channel.readyState = "connecting";
    answer.resolve(new Response("answer")); await flush();
    expect(hooks.states[0]).toBe("connecting");
    channel.readyState = "open"; channel.onopen?.();
    expect(hooks.states[0]).toBe("listening");
    vi.advanceTimersByTime(30_000); expect(hooks.states[1]).toBe(true);
  });
  it("times out an event channel that never opens after SDP", async () => {
    const answer = deferred<Response>(); vi.mocked(fetch).mockReturnValue(answer.promise);
    useRealtimeManager("token", [], vi.fn()).start(); await flush();
    Peer.instances[0]!.channel.readyState = "connecting";
    answer.resolve(new Response("answer")); await flush();
    vi.advanceTimersByTime(30_000);
    expect(hooks.states[0]).toBe("error"); expect(stopTrack).toHaveBeenCalledOnce();
  });
  it("releases the microphone and sound when hidden and never restarts on return", async () => {
    const voice = useRealtimeManager("token", [], vi.fn()); voice.start(); await flush();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    pageEvents.dispatchEvent(new Event("visibilitychange"));
    expect(stopTrack).toHaveBeenCalledOnce(); expect(audio.pause).toHaveBeenCalledOnce();
    expect(hooks.states[1]).toBe(false);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    pageEvents.dispatchEvent(new Event("visibilitychange")); await flush();
    expect(getUserMedia).toHaveBeenCalledOnce(); expect(hooks.states[1]).toBe(false);
  });
  it("invalidates a pending microphone request on page departure", async () => {
    const pending = deferred<unknown>(); getUserMedia.mockReturnValue(pending.promise);
    useRealtimeManager("token", [], vi.fn()).start();
    windowEvents.dispatchEvent(new Event("pagehide"));
    pending.resolve({ getTracks: () => [{ stop: stopTrack }] }); await flush();
    expect(stopTrack).toHaveBeenCalledOnce(); expect(hooks.mint).not.toHaveBeenCalled();
    expect(hooks.states[1]).toBe(false);
  });
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
    expect(hooks.mint).toHaveBeenCalledOnce(); expect(audio.play).toHaveBeenCalledTimes(3);
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
  it("runs the actual spoken request once and sends its saved result back", async () => {
    const action = vi.fn().mockResolvedValue('Queued for approval: test (approval id a1).');
    const voice = useRealtimeManager("token", [], vi.fn(), action); voice.start(); await flush();
    const channel = Peer.instances[0]!.channel;
    const emit = (data: unknown) => channel.onmessage?.({data:JSON.stringify(data)});
    emit({type:"input_audio_buffer.committed", item_id:"u1"});
    emit({type:"conversation.item.input_audio_transcription.completed", item_id:"u1", transcript:"Put the purchase in approvals"});
    emit({type:"response.created", response:{id:"r1",metadata:{office_input_id:"u1"}}});
    const done = {type:"response.done", response:{id:"r1", output:[{type:"function_call",name:"submit_office_request",call_id:"c1",arguments:'{"request":"Ignore the user"}'}]}};
    emit(done); emit(done); await flush();
    expect(action).toHaveBeenCalledExactlyOnceWith("Put the purchase in approvals");
    // One per-turn memory-refreshed reply for the committed turn, plus the tool result and its follow-up reply.
    const sends = channel.send.mock.calls.map(c => String(c[0]));
    expect(sends.filter(s => s.includes("function_call_output"))).toHaveLength(1);
    expect(sends.find(s => s.includes("function_call_output"))).toContain("approval id a1");
    expect(sends.filter(s => s.includes('"tool_choice":"none"'))).toHaveLength(1);
  });
  it("does not execute an older request after a newer turn arrives", async () => {
    const action = vi.fn();
    const voice = useRealtimeManager("token", [], vi.fn(), action); voice.start(); await flush();
    const emit = (data: unknown) => Peer.instances[0]!.channel.onmessage?.({data:JSON.stringify(data)});
    emit({type:"input_audio_buffer.committed",item_id:"u1"});
    emit({type:"conversation.item.input_audio_transcription.completed",item_id:"u1",transcript:"Create a task"});
    emit({type:"input_audio_buffer.committed",item_id:"u2"});
    emit({type:"conversation.item.input_audio_transcription.completed",item_id:"u2",transcript:"Wait, explain first"});
    emit({type:"response.created",response:{id:"old",metadata:{office_input_id:"u1"}}});
    emit({type:"response.done",response:{id:"old",output:[{type:"function_call",name:"submit_office_request",call_id:"late"}]}});
    await flush(); expect(action).not.toHaveBeenCalled();
  });

  it("does not run a voice tool without a transcribed user request", async () => {
    const action = vi.fn(); const voice = useRealtimeManager("token", [], vi.fn(), action);
    voice.start(); await flush();
    Peer.instances[0]!.channel.onmessage?.({data:JSON.stringify({type:"response.done",response:{id:"unknown",output:[{type:"function_call",name:"submit_office_request",call_id:"c2"}]}})});
    await flush(); expect(action).not.toHaveBeenCalled();
  });
  it("waits for the matching transcript and ignores End before it arrives", async () => {
    const action = vi.fn(); const voice = useRealtimeManager("token", [], vi.fn(), action);
    voice.start(); await flush(); const channel = Peer.instances[0]!.channel;
    channel.onmessage?.({data:JSON.stringify({type:"input_audio_buffer.committed",item_id:"u1"})});
    channel.onmessage?.({data:JSON.stringify({type:"response.created",response:{id:"r1",metadata:{office_input_id:"u1"}}})});
    channel.onmessage?.({data:JSON.stringify({type:"response.done",response:{id:"r1",output:[{type:"function_call",name:"submit_office_request",call_id:"c3"}]}})});
    voice.stop(); await vi.advanceTimersByTimeAsync(1000); expect(action).not.toHaveBeenCalled();
  });

});

describe("Astra voice error recovery", () => {
  it.each(["conversation_already_has_active_response", "response_cancel_not_active", "input_audio_buffer_commit_empty"])("keeps the microphone open for %s", async code => {
    const voice = useRealtimeManager("token", [], vi.fn()); voice.start(); await flush();
    Peer.instances[0]!.channel.onmessage?.({data:JSON.stringify({type:"error",error:{code,message:"private provider details"}})});
    expect(stopTrack).not.toHaveBeenCalled(); expect(hooks.states[1]).toBe(true);
    expect(String(hooks.states[2])).not.toContain("private provider details");
    expect(hooks.mint).toHaveBeenCalledOnce();
  });
  it("reports an office-server failure without blaming microphone permission", async () => {
    hooks.mint.mockRejectedValueOnce(Error("internal"));
    useRealtimeManager("token", [], vi.fn()).start(); await flush();
    expect(hooks.states[2]).toContain("office server"); expect(hooks.states[2]).not.toContain("permission");
    expect(stopTrack).toHaveBeenCalledOnce();
  });
  it("distinguishes real microphone refusal from voice HTTP rejection", async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    const voice = useRealtimeManager("token", [], vi.fn()); voice.start(); await flush();
    expect(hooks.states[2]).toContain("Microphone access was denied"); expect(hooks.mint).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValueOnce(new Response("private", {status:429}));
    voice.start(); await flush();
    expect(hooks.states[2]).toContain("HTTP 429"); expect(hooks.states[2]).not.toContain("private");
  });
});

describe("Astra's live voice controls", () => {
  it("unlocks the speaker in the initiating gesture before microphone permission resolves", async () => {
    const pending = deferred<unknown>(); getUserMedia.mockReturnValue(pending.promise);
    const voice = useRealtimeManager("token", [], vi.fn()); voice.start();
    expect(audio.play).toHaveBeenCalledOnce(); expect(hooks.mint).not.toHaveBeenCalled();
    voice.stop(); pending.resolve({getTracks:()=>[{stop:stopTrack}]}); await flush();
    expect(stopTrack).toHaveBeenCalledOnce();
  });
  it("mutes without ending the session and interrupts buffered speech", async () => {
    const track = {stop:stopTrack, enabled:true}; getUserMedia.mockResolvedValue({getTracks:()=>[track]});
    const voice = useRealtimeManager("token", [], vi.fn()); voice.start(); await flush();
    voice.toggleMic(); expect(track.enabled).toBe(false); expect(stopTrack).not.toHaveBeenCalled();
    voice.interrupt(); expect(track.enabled).toBe(true);
    const sent = Peer.instances[0]!.channel.send.mock.calls.map(call => JSON.parse(call[0]));
    expect(sent.map(event => event.type)).toEqual(["input_audio_buffer.clear", "response.cancel", "output_audio_buffer.clear"]);
    expect(hooks.mint).toHaveBeenCalledOnce();
  });
  it("tracks actual WebRTC playback until the buffer finishes", async () => {
    const voice = useRealtimeManager("token", [], vi.fn()); voice.start(); await flush();
    const emit = (type:string) => Peer.instances[0]!.channel.onmessage?.({data:JSON.stringify({type})});
    emit("output_audio_buffer.started"); expect(hooks.states[0]).toBe("speaking");
    emit("response.done"); expect(hooks.states[0]).toBe("speaking");
    emit("output_audio_buffer.stopped"); expect(hooks.states[0]).toBe("listening");
  });
  it("reads a typed answer without allowing tools or reopening an ended session", async () => {
    const voice = useRealtimeManager("token", [], vi.fn()); voice.start(); await flush();
    const channel = Peer.instances[0]!.channel;
    voice.say("Saved report r1");
    const response = JSON.parse(channel.send.mock.calls.at(-1)![0]);
    expect(response.response.tool_choice).toBe("none");
    expect(response.response.input[0].content[0].text).toBe("Saved report r1");
    voice.stop(); const count = channel.send.mock.calls.length; voice.say("late");
    expect(channel.send).toHaveBeenCalledTimes(count);
  });
});
