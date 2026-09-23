import { describe, expect, it, vi } from "vitest";
import {
  CONTINUITY_UNAVAILABLE,
  RECENT_KEEP_LIMIT,
  readAstraContinuity,
  recordAstraSummary,
  recordAstraTurn,
  type Rest,
} from "./astra-continuity";
import { runManagerChatWith, type ManagerDeps } from "./manager.functions";
import { saveConversationSummaryWith, type SummaryDeps } from "./conversation-summary.functions";
import type { OwnerVerification } from "./canx-backend.server";

const OWNER_ID = "11111111-2222-3333-4444-555555555555";
const OWNER: OwnerVerification = { ok: true, userId: OWNER_ID, email: "o@example.com", aal: "aal2" };
const ok = (body: unknown) => ({ ok: true, status: 200, body });

function fakeRest(overrides: Partial<Record<"memory" | "summaries" | "recent", unknown>> = {}) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const rest: Rest = vi.fn(async (path, init) => {
    calls.push({ path, init });
    if (path.startsWith("astra_memory")) return "memory" in overrides ? (overrides.memory as never) : ok([{ category: "goal", title: "Grow CanX", content: "Keep the office honest", priority: 5, active: true, source: "handover" }]);
    if (path.startsWith("astra_conversation_summaries")) return "summaries" in overrides ? (overrides.summaries as never) : ok([{ summary: "Agreed Monday round table agenda", updated_at: "2026-09-20" }]);
    if (path.startsWith("astra_recent_context?select=role")) return "recent" in overrides ? (overrides.recent as never) : ok([{ role: "assistant", content: "Second", created_at: "b" }, { role: "user", content: "First", created_at: "a" }]);
    return ok([]);
  });
  return { rest, calls };
}

describe("reading continuity", () => {
  it("reads all three tables filtered on the verified owner and labels them untrusted", async () => {
    const { rest, calls } = fakeRest();
    const result = await readAstraContinuity(rest, OWNER_ID);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(3);
    for (const c of calls) expect(c.path).toContain(`owner_id=eq.${OWNER_ID}`);
    expect(calls[0]!.path).toContain("active=is.true");
    expect(calls.every(c => /limit=\d+/.test(c.path))).toBe(true);
    expect(result.text).toContain("UNTRUSTED");
    expect(result.text).toContain("Grow CanX");
    expect(result.text).toContain("Monday round table");
    expect(result.text.indexOf("First")).toBeLessThan(result.text.indexOf("Second"));
  });

  it("degrades honestly when any table fails and invents nothing", async () => {
    const { rest } = fakeRest({ summaries: { ok: false, status: 403, body: null } });
    const result = await readAstraContinuity(rest, OWNER_ID);
    expect(result.ok).toBe(false);
    expect(result.text).toBe(CONTINUITY_UNAVAILABLE);
    expect(result.text).not.toContain("Grow CanX");
  });

  it("refuses an unverified owner id without any request", async () => {
    const { rest } = fakeRest();
    expect((await readAstraContinuity(rest, "")).ok).toBe(false);
    expect(rest).not.toHaveBeenCalled();
  });
});

describe("writing recent turns", () => {
  it("writes both turns for the owner and prunes beyond the keep limit", async () => {
    const calls: { path: string; init?: RequestInit }[] = [];
    const rest: Rest = async (path, init) => {
      calls.push({ path, init });
      if (path.includes("offset=")) return ok([{ id: "99999999-2222-3333-4444-555555555555" }]);
      return ok(null);
    };
    const result = await recordAstraTurn(rest, OWNER_ID, "hello", "hi John");
    expect(result).toEqual({ saved: true, pruned: true });
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body.map((r: { owner_id: string; role: string }) => [r.owner_id, r.role])).toEqual([[OWNER_ID, "user"], [OWNER_ID, "assistant"]]);
    expect(calls[1]!.path).toContain(`offset=${RECENT_KEEP_LIMIT}`);
    expect(calls[2]!.init?.method).toBe("DELETE");
    expect(calls[2]!.path).toContain(`owner_id=eq.${OWNER_ID}`);
  });

  it("reports an insert failure honestly", async () => {
    const rest: Rest = async () => ({ ok: false, status: 403, body: null });
    expect(await recordAstraTurn(rest, OWNER_ID, "a", "b")).toEqual({ saved: false, pruned: false });
  });
});

function chatDeps(extra: Partial<ManagerDeps>): ManagerDeps {
  return {
    verifyOwner: async () => OWNER,
    reserve: async () => ({ allowed: true, reservationId: "r1", remainingToday: 10 }),
    settle: async () => undefined,
    buildContext: async () => ({ ok: true, text: "LIVE OFFICE CONTEXT" }),
    fetchImpl: vi.fn(async (input: unknown, init?: RequestInit) => {
      if (String(input).includes("/v1/models/")) return new Response("{}", { status: 200 });
      return new Response(JSON.stringify({ output_text: `ANSWER ${String(init?.body).includes("Grow CanX") ? "with memory" : "without memory"}` }), { status: 200 });
    }) as unknown as typeof fetch,
    openaiKey: "sk-test-not-real",
    model: "gpt-test",
    ...extra,
  };
}
const CHAT = { accessToken: "t", messages: [{ role: "user" as const, content: "What are my goals?" }] };

describe("Manager chat integration", () => {
  it("reads memory before the paid reply and saves the turn for the verified owner only", async () => {
    const order: string[] = [];
    const recordTurn = vi.fn(async () => { order.push("record"); return { saved: true, pruned: true }; });
    const deps = chatDeps({
      reserve: async () => { order.push("reserve"); return { allowed: true, reservationId: "r1", remainingToday: 1 }; },
      readContinuity: async (_t, ownerId) => { order.push(`read:${ownerId}`); return readAstraContinuity(fakeRest().rest, ownerId); },
      recordTurn,
    });
    const reply = await runManagerChatWith(deps, CHAT);
    expect(reply.ok).toBe(true);
    expect(reply.text).toContain("with memory");
    expect(order).toEqual([`read:${OWNER_ID}`, "reserve", "record"]);
    expect(recordTurn).toHaveBeenCalledWith("t", OWNER_ID, "What are my goals?", reply.text);
  });

  it("never reads or writes continuity when owner verification fails", async () => {
    const readContinuity = vi.fn(); const recordTurn = vi.fn();
    const reply = await runManagerChatWith(chatDeps({
      verifyOwner: async () => ({ ok: false, reason: "mfa_required", message: "x" }),
      readContinuity, recordTurn,
    }), CHAT);
    expect(reply.ok).toBe(false);
    expect(readContinuity).not.toHaveBeenCalled();
    expect(recordTurn).not.toHaveBeenCalled();
  });

  it("does not write a turn when the provider fails or the budget blocks", async () => {
    const recordTurn = vi.fn();
    const failing = chatDeps({ recordTurn, readContinuity: async () => ({ ok: false, text: CONTINUITY_UNAVAILABLE, message: "" }),
      fetchImpl: vi.fn(async (input: unknown) => String(input).includes("/v1/models/") ? new Response("{}") : new Response("{}", { status: 500 })) as unknown as typeof fetch });
    expect((await runManagerChatWith(failing, CHAT)).ok).toBe(false);
    const blocked = chatDeps({ recordTurn, reserve: async () => ({ allowed: false, reservationId: "", remainingToday: 0, message: "limit" } as never) });
    expect((await runManagerChatWith(blocked, CHAT)).code).toBe("limit_blocked");
    expect(recordTurn).not.toHaveBeenCalled();
  });

  it("a failed continuity read tells Astra continuity was not read", async () => {
    let sent = "";
    const deps = chatDeps({
      readContinuity: async () => { throw new Error("down"); },
      fetchImpl: vi.fn(async (input: unknown, init?: RequestInit) => {
        if (String(input).includes("/v1/models/")) return new Response("{}");
        sent = String(init?.body);
        return new Response(JSON.stringify({ output_text: "ok" }));
      }) as unknown as typeof fetch,
    });
    expect((await runManagerChatWith(deps, CHAT)).ok).toBe(true);
    expect(sent).toContain("NOT READ");
  });
});

describe("summary integration", () => {
  it("mirrors a verified Brain summary into Astra summaries for the verified owner", async () => {
    const mirror = vi.fn(async () => true);
    let saved = false;
    const deps: SummaryDeps = {
      verify: async () => OWNER,
      readSaved: async () => ({ ok: true, note: saved ? { title: "T", summary: "S" } : null }),
      reserve: async () => ({ allowed: true, reservationId: "r", remainingToday: 1 }),
      settle: async () => undefined,
      summarize: async () => ({ title: "T", summary: "S" }),
      save: async () => { saved = true; return true; },
      mirror,
    };
    const result = await saveConversationSummaryWith(deps, { accessToken: "t", confirmed: true, id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", turns: [{ role: "user", content: "office goal" }, { role: "assistant", content: "noted" }] });
    expect(result.ok).toBe(true);
    expect(mirror).toHaveBeenCalledWith("t", OWNER_ID, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "T: S");
  });

  it("summary mirror rejects an unverified owner id", async () => {
    const rest = vi.fn() as unknown as Rest;
    expect(await recordAstraSummary(rest, "bad", "k", "s")).toBe(false);
    expect(rest).not.toHaveBeenCalled();
  });
});
