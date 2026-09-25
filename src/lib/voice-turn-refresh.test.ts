import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { managerRealtimeSessionBody, refreshManagerVoiceContextWith } from "./manager-realtime.functions";
import { CONTINUITY_UNAVAILABLE } from "./astra-continuity";
import { voiceTurnEvents, VOICE_REFRESH_GAP_NOTE } from "./voice-turn-refresh";
import { VoiceTurnPairer } from "./voice-turns";
import type { OwnerVerification } from "./canx-backend.server";

const OWNER: OwnerVerification = { ok: true, userId: "owner-1", email: "o@example.com", aal: "aal2" };

describe("live voice refreshes durable memory on every turn", () => {
  it("two successive turns in one session receive different, current memory", async () => {
    let memory = "Goal: first";
    const readContinuity = vi.fn(async (_t: string, id: string) => ({ ok: true as const, text: `MEMORY(${id}): ${memory}`, counts: { memory: 1, summaries: 0, recent: 0 } }));
    const deps = { verifyOwner: async () => OWNER, buildContext: async () => ({ ok: true as const, text: "OFFICE" }), readContinuity };
    const first = await refreshManagerVoiceContextWith(deps, "t", []);
    memory = "Goal: second";
    const second = await refreshManagerVoiceContextWith(deps, "t", []);
    expect(first.ok && first.instructions).toContain("Goal: first");
    expect(second.ok && second.instructions).toContain("Goal: second");
    expect(readContinuity).toHaveBeenCalledTimes(2);
    expect(readContinuity).toHaveBeenCalledWith("t", "owner-1");
    const e1 = voiceTurnEvents(first), e2 = voiceTurnEvents(second);
    expect(JSON.stringify(e1)).toContain("Goal: first");
    expect(JSON.stringify(e2)).toContain("Goal: second");
  });

  it("routes ordinary conversation through reasoning and binds its input id", () => {
    const events = voiceTurnEvents(null, "turn-2");
    expect(events.at(-1)).toMatchObject({ response: {
      tool_choice: { type: "function", name: "submit_office_request" },
      metadata: { office_input_id: "turn-2" },
    } });
  });

  it("states a memory gap and continues on office records", async () => {
    const r = await refreshManagerVoiceContextWith({ verifyOwner: async () => OWNER, buildContext: async () => ({ ok: true as const, text: "OFFICE" }), readContinuity: async () => { throw new Error("down"); } }, "t", []);
    expect(r.ok).toBe(true);
    expect(r.memoryRead).toBe(false);
    expect(r.instructions).toContain(CONTINUITY_UNAVAILABLE);
  });

  it("failed refresh falls back to verified session context with an explicit gap note", () => {
    const events = voiceTurnEvents(null);
    expect(JSON.stringify(events)).toContain(VOICE_REFRESH_GAP_NOTE);
    expect(events).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: "response.create", response: { tool_choice: { type: "function", name: "submit_office_request" } } });
  });

  it("never reads memory for an unverified owner", async () => {
    const readContinuity = vi.fn();
    const r = await refreshManagerVoiceContextWith({ verifyOwner: async () => ({ ok: false, reason: "mfa_required", message: "x" }), buildContext: vi.fn(), readContinuity }, "t", []);
    expect(r.ok).toBe(false);
    expect(readContinuity).not.toHaveBeenCalled();
  });

  it("automatic replies wait for the refresh; interruption stays on", () => {
    const td = managerRealtimeSessionBody("gpt-realtime", "x").session.audio.input.turn_detection;
    expect(td.create_response).toBe(false);
    expect(td.interrupt_response).toBe(true);
    expect(managerRealtimeSessionBody("gpt-realtime", "x").session.output_modalities).toEqual(["audio"]);
    expect(voiceTurnEvents(null)[0]).toMatchObject({ response: { output_modalities: ["audio"] } });
    const hook = readFileSync("src/lib/use-realtime-manager.ts", "utf8");
    expect(hook).toContain("refreshedInputs.has(inputId)");
    expect(hook).toContain("voiceTurnEvents(result, inputId)");
  });

  it("two ordinary turns are each persisted exactly once", () => {
    const p = new VoiceTurnPairer();
    const saved = [p.feed("user", "one"), p.feed("assistant", "a1"), p.feed("assistant", "a1"), p.feed("user", "two"), p.feed("assistant", "a2")].filter(Boolean);
    expect(saved).toEqual([{ user: "one", answer: "a1" }, { user: "two", answer: "a2" }]);
  });
});
