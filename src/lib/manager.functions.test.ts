import { describe, expect, it, vi } from "vitest";
import { computeManagerStatus, runManagerChat } from "./manager.functions";

describe("Office Manager adapter fails closed", () => {
  it("makes NO upstream fetch when a key is present but no owner auth exists", async () => {
    process.env["OPENAI_API_KEY"] = "sk-test-not-real";
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("upstream fetch must not happen");
    });
    const reply = await runManagerChat({ messages: [{ role: "user", content: "hello" }], context: "x" });
    expect(spy).not.toHaveBeenCalled();
    expect(reply.code).toBe("auth_not_ready");
    expect(reply.ok).toBe(false);
    spy.mockRestore();
  });

  it("reports configured-but-unverified as disconnected", async () => {
    process.env["OPENAI_API_KEY"] = "sk-test-not-real";
    const status = computeManagerStatus();
    expect(status.connected).toBe(false);
    expect(status.state).toBe("auth_unavailable");
    expect(status.keyPresent).toBe(true);
  });

  it("reports missing key with no auth as disconnected too", async () => {
    delete process.env["OPENAI_API_KEY"];
    const status = computeManagerStatus();
    expect(status.connected).toBe(false);
    expect(status.keyPresent).toBe(false);
    expect(status.authReady).toBe(false);
  });
});
