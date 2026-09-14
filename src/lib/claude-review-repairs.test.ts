/**
 * Focused regression tests for the 14 September 2026 no-credit repair backlog:
 * scope output limits, the Anthropic max_tokens length stop, no paid auto
 * retry, a compact valid JSON reply, the change-log "at" column, and honest
 * separation of sample values from live Reception content.
 */
import { describe, expect, it, vi } from "vitest";
import {
  MAX_TOKENS_BY_SCOPE,
  runClaudeReviewWith,
  systemPromptFor,
  type ClaudeDeps,
} from "./claude-review.functions";
import { buildLiveOfficeContext, type RestImpl } from "./office-live-context.server";
import type { OwnerVerification } from "./canx-backend.server";

const OWNER: OwnerVerification = { ok: true, userId: "u1", email: "owner@example.com", aal: "aal2" };
const KEY = "sk-ant-test-not-real";

/** A complete, compact review body — no whitespace between JSON tokens. */
const COMPACT_REVIEW =
  '{"recommendation":"agree","confidence":"medium","strongestReasons":["Evidence is stated."],' +
  '"risks":["Unverified sources."],"missingEvidence":["No customer interviews."],"nextStep":"Hold."}';

interface Recorded {
  url: string;
  body: Record<string, unknown> | null;
}

function harness(
  messagesResponse: () => Response,
  overrides: Partial<ClaudeDeps> = {},
): { deps: ClaudeDeps; calls: Recorded[]; settled: string[] } {
  const calls: Recorded[] = [];
  const settled: string[] = [];
  const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
    const href = String(url);
    let body: Record<string, unknown> | null = null;
    if (typeof init?.body === "string") body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url: href, body });
    // Non-billable health check.
    if (href.includes("/v1/models")) return new Response(JSON.stringify({ id: "claude-test" }), { status: 200 });
    return messagesResponse();
  });

  const deps: ClaudeDeps = {
    verifyOwner: async () => OWNER,
    reserve: async () => ({ allowed: true, reservationId: "r1", remainingToday: 10 }),
    settle: async (_t, _r, outcome) => {
      settled.push(outcome);
    },
    fetchImpl: fetchImpl as unknown as typeof fetch,
    anthropicKey: KEY,
    model: "claude-test",
    buildOfficeContext: async () => ({ ok: true, text: "Office snapshot for the test." }),
    ...overrides,
  };
  return { deps, calls, settled };
}

const INPUT = {
  accessToken: "t",
  subject: "Opportunity Scout",
  primaryRecommendation: "HOLD until demand evidence exists",
  evidence: "No customer interviews yet.",
  question: "Is HOLD the right call?",
};

const PICTURE = `data:image/jpeg;base64,${"A".repeat(200)}`;

const messagesCalls = (calls: Recorded[]) => calls.filter((c) => c.url.includes("/v1/messages"));

describe("scope output limits", () => {
  it("documents the backlog limits", () => {
    expect(MAX_TOKENS_BY_SCOPE).toEqual({ manual: 1600, room: 2200, office: 3200 });
  });

  const cases: { scope: "manual" | "room" | "office"; extra: Record<string, unknown>; expected: number }[] = [
    { scope: "manual", extra: {}, expected: 1600 },
    { scope: "room", extra: { image: PICTURE, roomLabel: "Finance", path: "/finance" }, expected: 2200 },
    { scope: "office", extra: {}, expected: 3200 },
  ];

  for (const testCase of cases) {
    it(`sends max_tokens ${testCase.expected} for a ${testCase.scope} review`, async () => {
      const { deps, calls } = harness(
        () => new Response(JSON.stringify({ content: [{ type: "text", text: COMPACT_REVIEW }] }), { status: 200 }),
      );
      const reply = await runClaudeReviewWith(deps, { ...INPUT, scope: testCase.scope, ...testCase.extra });
      expect(reply.ok).toBe(true);
      const sent = messagesCalls(calls);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.body!["max_tokens"]).toBe(testCase.expected);
    });
  }
});

describe("compact JSON instruction", () => {
  it("asks every scope for a compact reply that fits the limit", () => {
    for (const scope of ["manual", "room", "office"] as const) {
      const prompt = systemPromptFor(scope);
      expect(prompt).toContain("COMPACT");
      expect(prompt).toContain("no markdown fences");
    }
  });

  it("accepts a compact reply with no whitespace between tokens", async () => {
    expect(COMPACT_REVIEW).not.toMatch(/\n/);
    const { deps, settled } = harness(
      () => new Response(JSON.stringify({ content: [{ type: "text", text: COMPACT_REVIEW }] }), { status: 200 }),
    );
    const reply = await runClaudeReviewWith(deps, INPUT);
    expect(reply.ok).toBe(true);
    expect(reply.structuredComplete).toBe(true);
    expect(reply.review?.recommendation).toBe("agree");
    expect(settled).toEqual(["ok"]);
  });
});

describe("Anthropic length stop (stop_reason max_tokens)", () => {
  const cutOff = () =>
    new Response(
      JSON.stringify({
        stop_reason: "max_tokens",
        content: [{ type: "text", text: '{"recommendation":"agree","confidence":"me' }],
      }),
      { status: 200 },
    );

  it("reports a length stop plainly and saves no partial review", async () => {
    const { deps } = harness(cutOff);
    const reply = await runClaudeReviewWith(deps, { ...INPUT, scope: "office" });
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe("incomplete_response");
    expect(reply.structuredComplete).toBe(false);
    expect(reply.review).toBeNull();
    expect(reply.detail).toContain("cut off");
    expect(reply.detail).toContain("length limit");
  });

  it("never makes a second paid call after a length stop", async () => {
    const { deps, calls, settled } = harness(cutOff);
    await runClaudeReviewWith(deps, { ...INPUT, scope: "office" });
    expect(messagesCalls(calls)).toHaveLength(1);
    // The call really happened, so the reservation settles as used, not freed.
    expect(settled).toEqual(["ok"]);
  });

  it("treats a length stop as incomplete even when the truncated text parses", async () => {
    const { deps } = harness(
      () =>
        new Response(JSON.stringify({ stop_reason: "max_tokens", content: [{ type: "text", text: COMPACT_REVIEW }] }), {
          status: 200,
        }),
    );
    const reply = await runClaudeReviewWith(deps, { ...INPUT, scope: "office" });
    expect(reply.code).toBe("incomplete_response");
    expect(reply.review).toBeNull();
  });

  it("malformed JSON without a length stop is still incomplete, with its own wording", async () => {
    const { deps } = harness(
      () => new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "sorry" }] }), { status: 200 }),
    );
    const reply = await runClaudeReviewWith(deps, INPUT);
    expect(reply.code).toBe("incomplete_response");
    expect(reply.detail).not.toContain("length limit");
    expect(reply.text).toBe("sorry");
  });
});

describe("change log reads the schema's at column", () => {
  const rest = (captured: string[]): RestImpl =>
    vi.fn(async (_config, _token, path: string) => {
      captured.push(path);
      if (path.startsWith("manager_changes"))
        return { ok: true, status: 200, body: [{ action: "saved task", entity: "task-1", at: "2026-09-14T10:00:00Z" }] };
      return { ok: true, status: 200, body: [] };
    });

  it("queries and renders at, never created_at", async () => {
    const captured: string[] = [];
    const result = await buildLiveOfficeContext({
      config: { url: "https://example.supabase.co", publishableKey: "pk" },
      token: "token",
      aal: "aal2",
      provider: "OpenAI",
      model: "gpt-test",
      rest: rest(captured),
    });
    expect(result.ok).toBe(true);
    const changeQuery = captured.find((p) => p.startsWith("manager_changes"))!;
    expect(changeQuery).toContain("select=action,entity,at");
    expect(changeQuery).toContain("order=at.desc");
    expect(changeQuery).not.toContain("created_at");
    if (result.ok) {
      expect(result.text).toContain("saved task");
      expect(result.text).toContain("2026-09-14T10:00:00Z");
      expect(result.text).not.toContain("at unknown");
    }
  });
});
