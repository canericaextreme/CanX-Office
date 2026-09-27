import { describe, expect, it, vi } from "vitest";
import { voiceTurnOutcome, voiceDiagnostic, VoiceTurnError } from "./voice-turn-outcome";
import { runManagerChatWith, type ManagerDeps } from "./manager.functions";
import { VoiceTurnPairer } from "./voice-turns";

const OWNER = { ok: true as const, userId: "u1", email: "o@example.com", aal: "aal2" as const };
function deps(fetchImpl: typeof fetch, over: Partial<ManagerDeps> = {}): ManagerDeps {
  return {
    verifyOwner: async () => OWNER,
    reserve: async () => ({ allowed: true, reservationId: "r1", remainingToday: 10 }),
    settle: async () => undefined,
    buildContext: async () => ({ ok: true, text: "CTX" }),
    fetchImpl, openaiKey: "sk-test-not-real", model: "gpt-test", ...over,
  };
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("voice turn failures are staged, never disguised as Astra's reply", () => {
  it("transcript arrives, provider busy → staged failure, no generic reply text", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok({})).mockResolvedValueOnce(new Response("{}", { status: 429 }));
    const reply = await runManagerChatWith(deps(f as unknown as typeof fetch), { accessToken: "t", messages: [{ role: "user", content: "음" }] });
    expect(reply.failedStage).toBe("assistant_provider");
    expect(reply.providerStatus).toBe(429);
    const out = voiceTurnOutcome(reply);
    expect(out.kind).toBe("failure");
    if (out.kind === "failure") { expect(out.message).toContain("HTTP 429"); expect(out.message).toContain("heard you"); }
  });
  it("office per-minute limit is labelled as the office, not the provider", async () => {
    const f = vi.fn();
    const reply = await runManagerChatWith(deps(f as unknown as typeof fetch, { reserve: async () => ({ allowed: false, reason: "rate_limit", message: "Astra's own office safety limit" }) }), { accessToken: "t", messages: [{ role: "user", content: "えっと" }] });
    expect(reply.failedStage).toBe("office_rate_limit");
    expect(f).not.toHaveBeenCalled();
  });
  it("health-check 429 is its own stage", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 429 }));
    const reply = await runManagerChatWith(deps(f as unknown as typeof fetch), { accessToken: "t", messages: [{ role: "user", content: "음" }] });
    expect(reply.failedStage).toBe("provider_check");
  });
  it.each(["음", "네", "えっと", "はい"])("short CJK transcript %s passes through and is answered", async (word) => {
    const f = vi.fn().mockResolvedValueOnce(ok({})).mockResolvedValueOnce(ok({ output_text: `答え ${word}` }));
    const reply = await runManagerChatWith(deps(f as unknown as typeof fetch), { accessToken: "t", messages: [{ role: "user", content: word }] });
    expect(reply.ok).toBe(true);
    const sent = JSON.parse((f.mock.calls[1]![1] as RequestInit).body as string);
    expect(sent.input.at(-1).content).toBe(word);
    expect(voiceTurnOutcome(reply)).toEqual({ kind: "answer", text: `答え ${word}` });
  });
  it("partial text with a later failure keeps the text and never shows busy", () => {
    const out = voiceTurnOutcome({ ok: false, text: "Partial answer", failedStage: "assistant_provider", detail: "The AI service is temporarily busy." });
    expect(out).toEqual({ kind: "answer", text: "Partial answer", partialFailure: "assistant_provider" });
  });
  it("speech playback failure after valid text leaves the answer intact", () => {
    const out = voiceTurnOutcome({ ok: true, text: "Valid answer" });
    expect(out.kind).toBe("answer");
    const err = new VoiceTurnError("speech_playback", "Written answer available; voice did not play.");
    expect(err.userMessage).not.toContain("busy");
  });
  it("interruption: a new turn cannot overwrite a completed reply", () => {
    const p = new VoiceTurnPairer();
    p.feed("user", "first", "a");
    expect(p.feed("assistant", "answer one", "a")).toEqual({ user: "first", answer: "answer one" });
    p.feed("user", "second", "b"); p.cancel("b");
    expect(p.feed("assistant", "late", "a")).toBeNull();
  });
  it("diagnostics carry no transcript content", () => {
    const d = voiceDiagnostic("assistant_provider", Date.now() - 5, 0, 429);
    expect(Object.keys(d).sort()).toEqual(["ms", "retries", "stage", "status"]);
  });
});
