import { describe, expect, it, vi } from "vitest";
import {
  computeManagerStatusWith,
  readSetting,
  runManagerChatWith,
  sanitizeToolArgs,
  type ManagerDeps,
} from "./manager.functions";
import { DENY_MESSAGES, type OwnerDenyReason, type OwnerVerification } from "./canx-backend.server";

const deny = (reason: OwnerDenyReason): OwnerVerification => ({
  ok: false,
  reason,
  message: DENY_MESSAGES[reason],
});

const OWNER: OwnerVerification = { ok: true, userId: "u1", email: "owner@example.com", aal: "aal2" };

function deps(overrides: Partial<ManagerDeps> = {}): ManagerDeps {
  return {
    verifyOwner: async () => deny("backend_not_configured"),
    reserve: async () => ({ allowed: true, reservationId: "r1", remainingToday: 10 }),
    settle: async () => undefined,
    fetchImpl: vi.fn(() => {
      throw new Error("no upstream call expected");
    }) as unknown as typeof fetch,
    openaiKey: "sk-test-not-real",
    model: "gpt-test",
    ...overrides,
  };
}

const CHAT = { accessToken: "t", messages: [{ role: "user" as const, content: "hello" }], context: "x" };

describe("access control — no paid call without a verified owner", () => {
  const cases: OwnerDenyReason[] = [
    "backend_not_configured",
    "no_session",
    "invalid_session",
    "expired_session",
    "mfa_required",
    "not_owner",
    "backend_error",
  ];

  for (const reason of cases) {
    it(`denies and makes no upstream request: ${reason}`, async () => {
      const fetchImpl = vi.fn();
      const reply = await runManagerChatWith(
        deps({ verifyOwner: async () => deny(reason), fetchImpl: fetchImpl as unknown as typeof fetch }),
        CHAT,
      );
      expect(reply.ok).toBe(false);
      expect(reply.code).toBe("auth_not_ready");
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  }

  it("a present key alone never enables anything", async () => {
    const fetchImpl = vi.fn();
    const status = await computeManagerStatusWith(
      deps({ fetchImpl: fetchImpl as unknown as typeof fetch }),
      "",
    );
    expect(status.connected).toBe(false);
    expect(status.state).toBe("auth_unavailable");
    expect(status.keyPresent).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("configuration gates for a verified owner", () => {
  it("denies when no key is configured", async () => {
    const fetchImpl = vi.fn();
    const reply = await runManagerChatWith(
      deps({ verifyOwner: async () => OWNER, openaiKey: undefined, fetchImpl: fetchImpl as unknown as typeof fetch }),
      CHAT,
    );
    expect(reply.code).toBe("not_configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("denies when no model is explicitly configured", async () => {
    const reply = await runManagerChatWith(deps({ verifyOwner: async () => OWNER, model: undefined }), CHAT);
    expect(reply.code).toBe("not_configured");
  });
});

describe("spending and rate limits", () => {
  it("denies when limits are unavailable", async () => {
    const fetchImpl = vi.fn();
    const reply = await runManagerChatWith(
      deps({
        verifyOwner: async () => OWNER,
        reserve: async () => ({ allowed: false, reason: "unavailable", message: "no limits" }),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
      CHAT,
    );
    expect(reply.code).toBe("limit_blocked");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("denies when the rate limit is hit", async () => {
    const reply = await runManagerChatWith(
      deps({
        verifyOwner: async () => OWNER,
        reserve: async () => ({ allowed: false, reason: "rate_limit", message: "too fast" }),
      }),
      CHAT,
    );
    expect(reply.code).toBe("limit_blocked");
  });

  it("denies when the budget limit is hit", async () => {
    const reply = await runManagerChatWith(
      deps({
        verifyOwner: async () => OWNER,
        reserve: async () => ({ allowed: false, reason: "budget_limit", message: "over budget" }),
      }),
      CHAT,
    );
    expect(reply.code).toBe("limit_blocked");
  });
});

describe("health check and provider errors", () => {
  it("stays disconnected when the live health check fails, and releases the reservation", async () => {
    const settle = vi.fn(async () => undefined);
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    const reply = await runManagerChatWith(deps({ verifyOwner: async () => OWNER, settle, fetchImpl }), CHAT);
    expect(reply.code).toBe("health_check_failed");
    expect(settle).toHaveBeenCalledWith("t", "r1", "failed");
  });

  it("never echoes an upstream body back to the browser", async () => {
    const fetchImpl = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/v1/models/")) return new Response("{}", { status: 200 });
      return new Response(JSON.stringify({ error: { message: "sk-leaked-key-detail" } }), { status: 500 });
    }) as unknown as typeof fetch;
    const reply = await runManagerChatWith(deps({ verifyOwner: async () => OWNER, fetchImpl }), CHAT);
    expect(reply.code).toBe("provider_error");
    expect(JSON.stringify(reply)).not.toContain("sk-leaked");
  });

  it("permits the call on the fully verified owner path", async () => {
    const fetchImpl = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/v1/models/")) return new Response("{}", { status: 200 });
      return new Response(JSON.stringify({ output_text: "Here are today's priorities." }), { status: 200 });
    }) as unknown as typeof fetch;
    const reply = await runManagerChatWith(deps({ verifyOwner: async () => OWNER, fetchImpl }), CHAT);
    expect(reply.ok).toBe(true);
    expect(reply.text).toContain("priorities");
  });

  it("reports verified status only after a passing health check", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const status = await computeManagerStatusWith(deps({ verifyOwner: async () => OWNER, fetchImpl }), "t");
    expect(status.connected).toBe(true);
    expect(status.state).toBe("verified");
  });
});

describe("tool arguments are strictly allowlisted", () => {
  it("drops unknown arguments and clamps values", () => {
    const args = sanitizeToolArgs(
      "preview_appearance",
      JSON.stringify({ surface: "slate", transparency: 500, evil: "rm -rf /", accent: "purple" }),
    );
    expect(args).toEqual({ surface: "slate", transparency: 80 });
  });

  it("rejects unknown tools", () => {
    expect(sanitizeToolArgs("deploy_everything", "{}")).toBeNull();
  });
});

describe("readSetting — configuration normalisation", () => {
  it("trims whitespace and newlines from a pasted value", () => {
    expect(readSetting("  sk-test-not-real\n")).toBe("sk-test-not-real");
  });

  it("treats an empty or whitespace-only value as not configured", () => {
    expect(readSetting("")).toBeUndefined();
    expect(readSetting("   \n\t ")).toBeUndefined();
    expect(readSetting(undefined)).toBeUndefined();
  });

  it("means an untrimmed model can never reach a request", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const status = await computeManagerStatusWith(
      deps({ verifyOwner: async () => OWNER, model: readSetting(" \n "), fetchImpl: fetchImpl as unknown as typeof fetch }),
      "token",
    );
    expect(status.state).toBe("not_configured");
    expect(status.connected).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("means an untrimmed key alone never enables anything", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const status = await computeManagerStatusWith(
      deps({
        verifyOwner: async () => OWNER,
        openaiKey: readSetting("\n\t"),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
      "token",
    );
    expect(status.state).toBe("not_configured");
    expect(status.keyPresent).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("bound fetch dependency", () => {
  it("works when fetch is supplied as a bound wrapper, not a detached reference", async () => {
    const calls: string[] = [];
    const globalLike = {
      fetch(url: string, _init?: unknown) {
        // Throws if invoked detached from its owner, like the worker runtime.
        calls.push(this === globalLike ? url : "DETACHED");
        return Promise.resolve(new Response("{}", { status: 200 }));
      },
    };
    const bound: typeof fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      globalLike.fetch(String(input), init)) as unknown as typeof fetch;

    const status = await computeManagerStatusWith(
      deps({ verifyOwner: async () => OWNER, fetchImpl: bound }),
      "token",
    );
    expect(status.connected).toBe(true);
    expect(calls[0]).toContain("https://api.openai.com/v1/models/");
    expect(calls).not.toContain("DETACHED");
  });
});
