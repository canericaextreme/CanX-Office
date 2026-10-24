import { describe, expect, it, vi } from "vitest";
import { pingColleague, verifyPingReply, type PingDeps } from "./pretrip-colleague";

const deps = (fetchImpl: typeof fetch, extra: Partial<PingDeps> = {}): PingDeps & { settle: ReturnType<typeof vi.fn> } => ({
  fetchImpl, openaiKey: "k", openaiModel: "gpt-x", anthropicKey: "k", anthropicModel: "claude-x",
  reserve: vi.fn(async () => ({ allowed: true as const, reservationId: "res1" })),
  settle: vi.fn(async () => undefined), ...extra,
}) as PingDeps & { settle: ReturnType<typeof vi.fn> };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const TITLE = "Fix ChatGPT visual connection today";

describe("verifyPingReply", () => {
  it("needs the one-time code and the shared title", () => {
    expect(verifyPingReply("PRETRIP-OK ABC | Fix ChatGPT visual connection today", "ABC", TITLE)).toEqual({ code: true, shared: true });
    expect(verifyPingReply("OK", "ABC", TITLE)).toEqual({ code: false, shared: false });
  });
});

describe("pingColleague", () => {
  it("passes a real two-way reply from Claude and settles the budget", async () => {
    const d = deps(async () => json({ id: "msg_1", content: [{ type: "text", text: "PRETRIP-OK ABC | Fix ChatGPT visual connection today" }] }));
    const r = await pingColleague(d, "claude", "ABC", TITLE);
    expect(r).toMatchObject({ sent: true, replied: true, verified: true, responseId: "msg_1" });
    expect(d.settle).toHaveBeenCalledWith("res1", "ok");
  });

  it("passes ChatGPT through the responses format", async () => {
    const r = await pingColleague(deps(async () => json({ id: "resp_1", output_text: "PRETRIP-OK ABC | Fix ChatGPT visual connection" })), "chatgpt", "ABC", TITLE);
    expect(r.verified).toBe(true);
  });

  it("names authentication failures as sending failures", async () => {
    const d = deps(async () => json({}, 401));
    const r = await pingColleague(d, "chatgpt", "ABC", TITLE);
    expect(r.verified).toBe(false);
    expect(r.failure).toContain("authentication");
    expect(d.settle).toHaveBeenCalledWith("res1", "failed");
  });

  it("sends nothing when the budget refuses or no key is set", async () => {
    const f = vi.fn();
    const refused = await pingColleague(deps(f as unknown as typeof fetch, { reserve: async () => ({ allowed: false, message: "Daily limit reached" }) }), "claude", "ABC", TITLE);
    expect(refused.sent).toBe(false);
    expect(refused.failure).toContain("budget");
    const noKey = await pingColleague(deps(f as unknown as typeof fetch, { anthropicKey: undefined }), "claude", "ABC", TITLE);
    expect(noKey.sent).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("flags a reply without the code", async () => {
    const r = await pingColleague(deps(async () => json({ id: "m", content: [{ type: "text", text: "Hello" }] })), "claude", "ABC", TITLE);
    expect(r).toMatchObject({ replied: true, verified: false });
    expect(r.failure).toContain("one-time code");
    expect(r.failure).toContain('reply began: "Hello"');
  });

  it("gives ChatGPT room to finish and says when its reply was cut off", async () => {
    let sent: Record<string, unknown> = {};
    const f = (async (_u: unknown, init?: RequestInit) => { sent = JSON.parse(String(init?.body)); return json({ id: "r", status: "incomplete", output_text: "PRETRIP-OK ABC |" }); }) as typeof fetch;
    const r = await pingColleague(deps(f), "chatgpt", "ABC", TITLE);
    expect(sent["max_output_tokens"]).toBe(400);
    expect(r.failure).toContain("cut off");
  });
});
