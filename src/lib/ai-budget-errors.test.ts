import { describe, expect, it, vi } from "vitest";
import { reserveAiCallWith } from "./canx-backend.server";
const config = { url: "https://office.example", publishableKey: "public-test-key" };

describe("AI budget failures stay closed and explain the next check", () => {
  it.each([
    [404, { code: "PGRST202", message: "private database detail" }, "function is missing"],
    [403, { code: "42501" }, "refused access"],
    [401, {}, "sign-in"],
    [200, [{ allowed: false, reason: "not_permitted" }], "two-step verification"],
    [200, [{ allowed: false, reason: "unavailable" }], "no usable AI spending limits"],
    [200, [{ allowed: false, reason: "budget_limit" }], "spending limit for this period"],
    [200, [{ allowed: false, reason: "rate_limit" }], "temporarily busy"],
  ])("explains HTTP %s / %j without granting access", async (status, body, expected) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
    const result = await reserveAiCallWith(config, "test-session", 2, fetcher);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.message).toContain(expected);
      expect(result.message).not.toContain("private database detail");
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("continues refusing unreachable checks", async () => {
    const result = await reserveAiCallWith(config, "test-session", 2, vi.fn().mockRejectedValue(new Error("offline")));
    expect(result.allowed).toBe(false);
  });
});
