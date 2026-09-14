import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  runClaudeReviewWith,
  REVIEW_AREAS,
  ESTIMATED_CENTS_BY_SCOPE,
  systemPromptFor,
  parseReview,
  type ClaudeDeps,
} from "./claude-review.functions";
import {
  managerRecommendationPrefill,
  openSecondEyes,
  consumePrefill,
  getSecondEyesState,
  sixAreaFindings,
  UNREVIEWED_AREA_TEXT,
} from "./second-eyes";
import type { OwnerVerification } from "./canx-backend.server";

const OWNER: OwnerVerification = { ok: true, userId: "u1", email: "owner@example.com", aal: "aal2" };
const KEY = "sk-ant-test-not-real";

// A 1x1 JPEG is enough: the guard only checks the format and the bounds.
const IMAGE = `data:image/jpeg;base64,${"A".repeat(400)}`;

const panel = readFileSync("src/components/office/SecondEyesPanel.tsx", "utf8");
const nav = readFileSync("src/components/office/OfficeNav.tsx", "utf8");
const manager = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
const reviewSource = readFileSync("src/lib/claude-review.functions.ts", "utf8");
const observe = readFileSync("src/lib/office-observe.ts", "utf8");

function okResponse(text: string) {
  return new Response(JSON.stringify({ content: [{ type: "text", text }] , model: "claude-test" }), { status: 200 });
}

function deps(overrides: Partial<ClaudeDeps> = {}): ClaudeDeps {
  return {
    verifyOwner: async () => OWNER,
    reserve: async () => ({ allowed: true, reservationId: "r1", remainingToday: 10 }),
    settle: async () => undefined,
    fetchImpl: vi.fn(async (_input: unknown, init?: RequestInit) =>
      init?.method === "POST" && String(_input).includes("messages") ? okResponse("plain reply") : okResponse("ok"),
    ) as unknown as typeof fetch,
    anthropicKey: KEY,
    model: "claude-test",
    buildOfficeContext: async () => ({ ok: true, text: REVIEW_AREAS.join("\n") }),
    ...overrides,
  };
}

const BASE = {
  accessToken: "t",
  subject: "Office page review",
  primaryRecommendation: "Review this page",
  evidence: "The picture",
  question: "What is risky?",
};

describe("reachable from every room without adding a destination", () => {
  it("the shared control lives in the office shell navigation", () => {
    expect(nav).toContain("SecondEyesPanel");
  });

  it("adds no new office route file", () => {
    expect(panel).not.toContain("createFileRoute");
  });

  it("keeps the Systems review panel in place", () => {
    const systems = readFileSync("src/routes/_office/systems.tsx", "utf8");
    expect(systems).toContain("ClaudeReviewPanel");
  });
});

describe("one-shot picture of the office page only", () => {
  it("uses the shared office capture and never a camera or screen share", () => {
    expect(panel).toContain("captureOfficeView");
    expect(panel).not.toContain("getDisplayMedia");
    expect(panel).not.toContain("getUserMedia");
  });

  it("capture excludes overlays and every form field", () => {
    expect(observe).toContain("data-canx-no-capture");
    expect(observe).toMatch(/input|textarea|select/i);
  });

  it("the panel itself is excluded from any picture", () => {
    expect(panel).toContain('data-canx-no-capture="true"');
  });

  it("only captures inside a button handler, never on navigation", () => {
    expect(panel).not.toMatch(/useEffect\([^)]*\)\s*=>\s*\{[^}]*captureOfficeView/);
  });
});

describe("a missing or invalid picture sends nothing", () => {
  it("refuses a room review with no picture", async () => {
    const fetchImpl = vi.fn();
    const reply = await runClaudeReviewWith(deps({ fetchImpl: fetchImpl as unknown as typeof fetch }), {
      ...BASE,
      scope: "room",
    });
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe("no_picture");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a room review with a picture that is not a bounded JPEG or PNG", async () => {
    const fetchImpl = vi.fn();
    const reply = await runClaudeReviewWith(deps({ fetchImpl: fetchImpl as unknown as typeof fetch }), {
      ...BASE,
      scope: "room",
      image: "data:image/gif;base64,AAAA",
    });
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe("no_picture");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("whole-office review uses a server-built snapshot", () => {
  it("builds the snapshot on the server after owner verification", async () => {
    const order: string[] = [];
    const build = vi.fn(async () => {
      order.push("context");
      return { ok: true as const, text: REVIEW_AREAS.join("\n") };
    });
    await runClaudeReviewWith(
      deps({
        verifyOwner: async () => {
          order.push("verify");
          return OWNER;
        },
        buildOfficeContext: build,
      }),
      { ...BASE, scope: "office" },
    );
    expect(order[0]).toBe("verify");
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the office snapshot cannot be read", async () => {
    const fetchImpl = vi.fn();
    const reply = await runClaudeReviewWith(
      deps({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        buildOfficeContext: async () => ({ ok: false as const, message: "unreadable" }),
      }),
      { ...BASE, scope: "office" },
    );
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe("context_unavailable");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("names all six operating areas", () => {
    expect(REVIEW_AREAS).toHaveLength(6);
    for (const area of [
      "Leadership & decisions",
      "Programmes/projects",
      "Operations/work board",
      "Money & records",
      "Systems/security/connections",
      "Team/skills",
    ]) {
      expect(REVIEW_AREAS).toContain(area);
    }
  });

  it("never falls back to sample data for office facts", () => {
    expect(reviewSource).not.toContain("SAMPLE_");
    expect(panel).not.toContain("SAMPLE_");
  });
});

describe("Claude stays a reviewer and changes nothing", () => {
  it("the review path writes no office data and takes no external action", () => {
    expect(reviewSource).not.toMatch(/\.from\(/);
    expect(reviewSource).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    expect(reviewSource).not.toMatch(/sendEmail|purchase|deploy\(/i);
  });

  it("untrusted material cannot change the reviewer's role", () => {
    expect(reviewSource).toContain("untrusted");
    expect(reviewSource).toContain("NOT the CanX Office Manager");
    expect(reviewSource).toContain("you are not an approver");
  });

  it("malformed JSON is not treated as a finished review", () => {
    expect(parseReview("I think it's fine, honestly.")).toBeNull();
  });
});

describe("no automatic paid call", () => {
  it("the panel only reviews from an explicit press", () => {
    // Every review starts in a click handler; the only thing an effect starts
    // is the free connection check.
    expect(panel).toContain("void reviewThisRoom()");
    expect(panel).toContain("void reviewWholeOffice(");
    expect(panel).toContain("void checkConnection()");
    expect(panel).not.toMatch(/setInterval|setTimeout\([^)]*review/i);
  });

  it("the Manager button only opens the panel", () => {
    expect(manager).toContain("openSecondEyes(managerRecommendationPrefill");
    expect(manager).not.toContain("requestClaudeReview");
  });

  it("the prepared assignment still only fills the form", () => {
    const assignments = readFileSync("src/lib/claude-assignments.ts", "utf8");
    expect(assignments).not.toContain("fetch(");
    expect(panel).toContain("CLAUDE_ASSIGNMENTS");
  });
});

describe("session-only shared state", () => {
  it("prefills the manual form without sending anything", () => {
    openSecondEyes(managerRecommendationPrefill("Hold the build until demand is proven."));
    const prefill = consumePrefill();
    expect(prefill?.primaryRecommendation).toContain("Hold the build");
    expect(prefill?.evidenceSource).toMatch(/Office Manager/);
    expect(getSecondEyesState().prefill).toBeNull();
  });

  it("keeps nothing in browser storage or a database", () => {
    const store = readFileSync("src/lib/second-eyes.ts", "utf8");
    expect(store).not.toContain("localStorage");
    expect(store).not.toContain("supabase");
  });
});

describe("Manager voice and the chatbot stay untouched", () => {
  it("the panel never reaches Manager voice or the realtime chat", () => {
    expect(panel).not.toContain("use-manager-voice");
    expect(panel).not.toContain("use-realtime-chat");
  });
});

describe("the verdict challenges a real claim", () => {
  it("a room review asks Claude to challenge the page-reliance claim", () => {
    expect(panel).toContain(
      "This page is clear, accurate, complete, truthfully labelled, and safe for John to rely on as shown.",
    );
    expect(panel).toContain("Challenge that claim");
  });

  it("a whole-office review challenges the office-readiness claim", () => {
    expect(panel).toContain(
      "The current CanX Office is coherent, truthful, adequately controlled, and ready to guide John\u2019s decisions across all six operating areas.",
    );
  });

  it("still asks about risks and gaps", () => {
    expect(panel).toMatch(/unverified/);
    expect(panel).toMatch(/missing/i);
  });
});

describe("whole-office prompt demands exactly six areas", () => {
  it("the office system prompt requires one entry per area, never omitted", () => {
    const prompt = systemPromptFor("office");
    expect(prompt).toContain("exactly six entries");
    expect(prompt).toContain("Never omit an area");
    for (const area of REVIEW_AREAS) expect(prompt).toContain(area);
  });

  it("a room or manual review keeps the ordinary prompt", () => {
    expect(systemPromptFor("room")).not.toContain("exactly six entries");
    expect(systemPromptFor("manual")).not.toContain("exactly six entries");
  });

  it("sends the office prompt only for a whole-office review", async () => {
    const bodies: string[] = [];
    const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes("/models/")) return okResponse("ok");
      bodies.push(String(init?.body ?? ""));
      return okResponse('{"recommendation":"agree","confidence":"low"}');
    });
    await runClaudeReviewWith(deps({ fetchImpl: fetchImpl as unknown as typeof fetch }), {
      ...BASE,
      scope: "office",
    });
    expect(bodies[0]).toContain("exactly six entries");
  });
});

describe("all six areas are always shown for a whole-office result", () => {
  it("fills missing areas with an unreviewed note instead of inventing one", () => {
    const rows = sixAreaFindings([{ area: "Money & records", finding: "Totals only." }]);
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.area)).toEqual([...REVIEW_AREAS]);
    expect(rows.find((r) => r.area === "Money & records")?.finding).toBe("Totals only.");
    expect(rows.filter((r) => !r.reviewed)).toHaveLength(5);
    for (const row of rows.filter((r) => !r.reviewed)) {
      expect(row.finding).toBe(UNREVIEWED_AREA_TEXT);
    }
  });

  it("keeps only the first finding when an area is duplicated", () => {
    const rows = sixAreaFindings([
      { area: "Team/skills", finding: "First" },
      { area: "Team/skills", finding: "Second" },
    ]);
    expect(rows).toHaveLength(6);
    expect(rows.filter((r) => r.area === "Team/skills")).toHaveLength(1);
    expect(rows.find((r) => r.area === "Team/skills")?.finding).toBe("First");
  });

  it("shows all six as unreviewed when nothing came back", () => {
    const rows = sixAreaFindings(undefined);
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.reviewed === false)).toBe(true);
  });

  it("the panel renders the six-area list for an office result", () => {
    expect(panel).toContain("sixAreaFindings(reply.review.areaFindings)");
  });
});

describe("a malformed or incomplete reply is never a finished review", () => {
  async function replyFor(text: string) {
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).includes("/models/") ? okResponse("ok") : okResponse(text),
    );
    return runClaudeReviewWith(deps({ fetchImpl: fetchImpl as unknown as typeof fetch }), BASE);
  }

  it("a provider success with unusable JSON is not a completed review", async () => {
    const reply = await replyFor("I think it's probably fine.");
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe("incomplete_response");
    expect(reply.structuredComplete).toBe(false);
    expect(reply.review).toBeNull();
    expect(reply.text).toContain("probably fine");
  });

  it("an incomplete reply with a missing confidence is refused too", async () => {
    const reply = await replyFor('{"recommendation":"agree"}');
    expect(reply.code).toBe("incomplete_response");
    expect(reply.structuredComplete).toBe(false);
  });

  it("a complete structured reply is marked complete", async () => {
    const reply = await replyFor('{"recommendation":"agree","confidence":"high","nextStep":"Go"}');
    expect(reply.ok).toBe(true);
    expect(reply.code).toBe("ok");
    expect(reply.structuredComplete).toBe(true);
  });

  it("an incomplete reply still settles the reservation as used", async () => {
    const settle = vi.fn(async () => undefined);
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).includes("/models/") ? okResponse("ok") : okResponse("not json"),
    );
    await runClaudeReviewWith(deps({ settle, fetchImpl: fetchImpl as unknown as typeof fetch }), BASE);
    expect(settle).toHaveBeenCalledWith("t", "r1", "ok");
  });

  it("the panel only records a completed structured review", () => {
    expect(panel).toContain("reply.ok && reply.structuredComplete");
    expect(panel).toContain('reply.code === "incomplete_response"');
  });
});

describe("coverage wording is unambiguous", () => {
  it("says Claude took no external action rather than sent nothing", async () => {
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).includes("/models/")
        ? okResponse("ok")
        : okResponse('{"recommendation":"agree","confidence":"low"}'),
    );
    const reply = await runClaudeReviewWith(deps({ fetchImpl: fetchImpl as unknown as typeof fetch }), BASE);
    expect(reply.coverage).toContain(
      "Claude is a reviewer only: it took no external action and changed or saved nothing in the Office.",
    );
    expect(reply.coverage.join(" ")).not.toContain("sent nothing");
  });
});

describe("budget reservation is conservative and honest", () => {
  const cases: [ "manual" | "room" | "office", number ][] = [
    ["manual", 3],
    ["room", 8],
    ["office", 15],
  ];

  it("keeps the published estimates", () => {
    expect(ESTIMATED_CENTS_BY_SCOPE).toEqual({ manual: 3, room: 8, office: 15 });
  });

  for (const [scope, cents] of cases) {
    it(`reserves ${cents} cents for a ${scope} review`, async () => {
      const reserve = vi.fn(async () => ({ allowed: true as const, reservationId: "r1", remainingToday: 10 }));
      const fetchImpl = vi.fn(async (url: unknown) =>
        String(url).includes("/models/")
          ? okResponse("ok")
          : okResponse('{"recommendation":"agree","confidence":"low"}'),
      );
      await runClaudeReviewWith(deps({ reserve, fetchImpl: fetchImpl as unknown as typeof fetch }), {
        ...BASE,
        scope,
        ...(scope === "room" ? { image: IMAGE } : {}),
      });
      expect(reserve).toHaveBeenCalledWith("t", cents);
    });
  }

  it("still reserves before the health check and refunds a failed check", async () => {
    const order: string[] = [];
    const settle = vi.fn(async () => {
      order.push("settle");
    });
    const reply = await runClaudeReviewWith(
      deps({
        reserve: async () => {
          order.push("reserve");
          return { allowed: true as const, reservationId: "r1", remainingToday: 10 };
        },
        settle,
        fetchImpl: vi.fn(async () => new Response("no", { status: 500 })) as unknown as typeof fetch,
      }),
      BASE,
    );
    expect(order).toEqual(["reserve", "settle"]);
    expect(reply.code).toBe("health_check_failed");
    expect(settle).toHaveBeenCalledWith("t", "r1", "failed");
  });

  it("shows the reservation beside the buttons", () => {
    expect(panel).toContain('reservationLabel("room")');
    expect(panel).toContain('reservationLabel("office")');
    expect(panel).toContain("Budget reservation: up to C$");
  });
});
