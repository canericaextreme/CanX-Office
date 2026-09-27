import { describe, expect, it, vi } from "vitest";
import { managerRealtimeInstructions, managerRealtimeSessionBody, parseVoiceMode, createManagerRealtimeSessionWith } from "./manager-realtime.functions";
import { directToolOutput } from "./use-realtime-manager";
import { VoiceTurnError } from "./voice-turn-outcome";
import { readFileSync } from "node:fs";

describe("Astra direct speech-to-speech (preview)", () => {
  it("defaults to the existing relay mode for anything but 'direct'", () => {
    expect(parseVoiceMode(undefined)).toBe("relay");
    expect(parseVoiceMode("x")).toBe("relay");
    expect(parseVoiceMode("direct")).toBe("direct");
  });

  it("relay session is unchanged: no automatic reply, arg-less tool", () => {
    const s = managerRealtimeSessionBody("gpt-realtime", "x").session;
    expect(s.audio.input.turn_detection.create_response).toBe(false);
    expect(s.tools[0].parameters.properties).toEqual({});
  });

  it("direct session replies from audio, keeps interruption, transcription and the office tool", () => {
    const s = managerRealtimeSessionBody("gpt-realtime", "x", "direct").session;
    expect(s.audio.input.turn_detection.create_response).toBe(true);
    expect(s.audio.input.turn_detection.interrupt_response).toBe(true);
    expect(s.audio.input.transcription.model).toBeTruthy();
    expect(s.output_modalities).toEqual(["audio"]);
    expect(s.tools[0].name).toBe("submit_office_request");
    expect(s.tools[0].parameters.required).toEqual(["request"]);
  });

  it("direct instructions route office facts/actions to the tool and forbid unconfirmed claims", () => {
    const text = managerRealtimeInstructions("CTX", [], "direct");
    expect(text).toMatch(/call submit_office_request/);
    expect(text).toMatch(/Never claim anything was saved/);
    expect(text).toContain("CTX");
    expect(managerRealtimeInstructions("CTX", [])).toMatch(/EVERY user turn/);
  });

  it("owner/MFA refusal still blocks direct mode before any provider call", async () => {
    const fetchImpl = vi.fn();
    const r = await createManagerRealtimeSessionWith({
      verifyOwner: async () => ({ ok: false, reason: "mfa_required", message: "Verify" }) as never,
      reserve: vi.fn(), settle: vi.fn(), buildContext: vi.fn(), fetchImpl, openaiKey: "k", realtimeModel: undefined,
    }, "t", [], "direct");
    expect(r.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("direct mode still reserves budget and sends the direct session body", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ value: "ek" }), { status: 200 }));
    const reserve = vi.fn(async () => ({ allowed: true, reservationId: "r" }) as never);
    const r = await createManagerRealtimeSessionWith({
      verifyOwner: async () => ({ ok: true, userId: "u", aal: "aal2" }) as never,
      reserve, settle: vi.fn(async () => undefined), buildContext: async () => ({ ok: true as const, text: "O" }),
      fetchImpl: fetchImpl as never, openaiKey: "k", realtimeModel: undefined,
    }, "t", [], "direct");
    expect(r.ok).toBe(true);
    expect(reserve).toHaveBeenCalledOnce();
    const body = JSON.parse(((fetchImpl.mock.calls[0] as unknown[])[1] as { body: string }).body);
    expect(body.session.audio.input.turn_detection.create_response).toBe(true);
  });

  it("tool output passes the guarded Office result through", async () => {
    const run = vi.fn(async () => "Saved report R-1.");
    const out = await directToolOutput(JSON.stringify({ request: "Add a report" }), run);
    expect(run).toHaveBeenCalledWith("Add a report");
    expect(out).toMatchObject({ ok: true, result: "Saved report R-1." });
  });

  it("tool failures never read as saved", async () => {
    const fail = await directToolOutput(JSON.stringify({ request: "x" }), async () => { throw new VoiceTurnError("other" as never, "Office busy."); });
    expect(fail.ok).toBe(false);
    expect(fail.note).toMatch(/Nothing should be described as saved/);
    expect((await directToolOutput("{bad", async () => "y")).ok).toBe(false);
    expect((await directToolOutput(JSON.stringify({ request: "x" }), undefined)).ok).toBe(false);
    expect((await directToolOutput(JSON.stringify({ request: "x" }), async () => "  ")).ok).toBe(false);
  });

  it("the separate Chat companion is not touched by direct mode", () => {
    const chat = readFileSync("src/lib/use-realtime-chat.ts", "utf8");
    expect(chat).not.toMatch(/direct|ManagerVoiceMode/);
  });
});
