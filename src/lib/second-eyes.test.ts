import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runClaudeReviewWith, REVIEW_AREAS, parseReview, type ClaudeDeps } from "./claude-review.functions";
import { managerRecommendationPrefill, openSecondEyes, consumePrefill, getSecondEyesState } from "./second-eyes";
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
