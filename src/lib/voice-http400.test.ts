import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createManagerRealtimeSessionWith, managerRealtimeSessionBody, type ManagerRealtimeDeps } from "./manager-realtime.functions";
import { safeProviderErrorFields, voiceProviderFailure } from "./voice-provider-error";

const hook = readFileSync("src/lib/use-realtime-manager.ts", "utf8");

function deps(o: Partial<ManagerRealtimeDeps> = {}): ManagerRealtimeDeps {
  return {
    verifyOwner: async () => ({ ok: true, userId: "owner", email: "o@x.test", aal: "aal2" }),
    reserve: async () => ({ allowed: true, reservationId: "r1", remainingToday: 100 }),
    settle: async () => undefined,
    buildContext: async () => ({ ok: true, text: "ctx" }),
    fetchImpl: (async () => new Response(JSON.stringify({ value: "ek_x" }))) as typeof fetch,
    openaiKey: "sk-test", realtimeModel: "gpt-realtime", ...o,
  };
}

describe("voice HTTP 400 diagnostics", () => {
  it("sends a GA client_secrets body with the model inside the session", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ value: "ek_x" })));
    await createManagerRealtimeSessionWith(deps({ fetchImpl: fetchImpl as typeof fetch }), "t", [], "direct");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    const body = JSON.parse(String(init.body));
    expect(body.session.type).toBe("realtime");
    expect(body.session.model).toBe("gpt-realtime");
    expect(body.session.audio.output.voice).toBe("shimmer");
    expect(body.session.modalities).toBeUndefined();
    expect(managerRealtimeSessionBody("m", "i", "relay").session.output_modalities).toEqual(["audio"]);
  });

  it("names the session setup step and safe fields on 400, settles the hold, no retry", async () => {
    const settle = vi.fn(async () => undefined);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: {
      code: "invalid_value", type: "invalid_request_error", param: "session.audio.output.voice",
      message: "secret raw text sk-live-123 John's notes" } }), { status: 400 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await createManagerRealtimeSessionWith(deps({ settle, fetchImpl: fetchImpl as typeof fetch }), "t", []);
    expect(r.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(settle).toHaveBeenCalledWith("t", "r1", "failed");
    expect(r.detail).toContain("session setup");
    expect(r.detail).toContain("code invalid_value");
    expect(r.detail).toContain("field session.audio.output.voice");
    expect(r.detail).not.toMatch(/secret|sk-live|John/);
  });

  it("drops messages and secret-shaped or long values", () => {
    expect(safeProviderErrorFields({ error: { code: "sk-abc123", type: "has space", param: "x".repeat(200), message: "m" } })).toEqual({});
    expect(voiceProviderFailure(400, null, null, "voice handshake")).toContain("no identifiable reason");
    expect(voiceProviderFailure(400, null)).toContain("HTTP 400");
  });

  it("posts SDP to /v1/realtime/calls without a model query and tags handshake failures", () => {
    expect(hook).toContain('REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls"');
    expect(hook).not.toContain("realtime/calls?model=");
    expect(hook).toContain('"voice handshake"');
    expect(hook).toMatch(/const fail = [\s\S]{0,120}teardown\(\)/);
  });
});
