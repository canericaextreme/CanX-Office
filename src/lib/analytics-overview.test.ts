import { describe, expect, it } from "vitest";
import {
  ANALYTICS_ELSIE_PROCEDURE, CARD_ORDER, MEASURED_STATES, analyticsForModel, buildAnalyticsOverview, taskBuildLink, taskView,
  type AnalyticsCard,
} from "./analytics-overview";
import { fail, fixtureRaw } from "./analytics-overview.fixture";

const cardOf = (cards: AnalyticsCard[], id: string) => cards.find((c) => c.id === id)!;
const allMetrics = (cards: AnalyticsCard[]) => cards.flatMap((c) => [c.headline, ...c.metrics]);

describe("Analytics measurements come only from real readings", () => {
  const o = buildAnalyticsOverview(fixtureRaw());

  it("builds all ten approved cards in order, each with a source on every reading", () => {
    expect(o.cards.map((c) => c.id)).toEqual(CARD_ORDER);
    expect(o.cards.map((c) => c.title)).toEqual(["Overall Office Health", "Money and Budgets", "API Usage and Credits", "Builder Performance", "Assignment Sources", "Projects and Readiness", "Time Management", "Bottlenecks and Improvements", "Top Three Actions", "Security and Recovery"]);
    for (const m of allMetrics(o.cards)) expect(m.source.length, m.label).toBeGreaterThan(5);
    for (const m of allMetrics(o.cards).filter((x) => x.state === "live")) expect(m.updatedAt, m.label).toBeTruthy();
  });

  it("reports the AI meter exactly, labelled as an estimate", () => {
    const api = cardOf(o.cards, "api");
    expect(api.headline.value).toBe("2,500 of 10,000 estimated cents (25%)");
    expect(api.headline.state).toBe("estimate");
    expect(api.metrics.find((m) => m.label === "Office AI calls this month")?.value).toBe("3"); // the September call is excluded
    expect(api.metrics.find((m) => m.label.startsWith("Provider credit"))?.state).toBe("not-connected");
    const perDay = api.series[0]!.points;
    expect(perDay).toHaveLength(17);
    expect(perDay[15]!.value).toBe(10); // day 16: 3 + 7 cents
  });

  it("keeps policy limits separate from measured spending", () => {
    const money = cardOf(o.cards, "money");
    const ceiling = money.metrics.find((m) => m.label.includes("ceiling") && m.state === "policy")!;
    expect(ceiling.value).toBe("C$500.00");
    expect(money.metrics.find((m) => m.label === "Manager AI allocation")).toMatchObject({ state: "policy", value: "C$100.00" });
    expect(money.headline).toMatchObject({ state: "live", value: "C$100.00 (2 receipts)" }); // excluded receipt and September left out
    expect(money.metrics.find((m) => m.label.startsWith("Room left"))).toMatchObject({ state: "estimate", value: "C$400.00" });
    expect(money.metrics.find((m) => m.label.startsWith("Subscriptions per month"))?.value).toBe("US$25.00"); // personal plan excluded
    expect(money.items[0]?.label).toContain("Supabase renews 2026-10-20");
    expect(cardOf(o.cards, "api").metrics.find((m) => m.label.includes("Claude builder cap"))?.state).toBe("policy");
  });

  it("counts builder runs, durations and failures from GitHub run records", () => {
    const b = cardOf(o.cards, "builders");
    expect(b.headline.value).toBe("Claude 2/4 passed · Codex 2/3 passed");
    expect(b.metrics.find((m) => m.label === "Claude builds")?.value).toBe("4 runs · 2 passed · 2 failed");
    expect(b.metrics.find((m) => m.label === "Cost per successful build")?.state).toBe("not-measured");
    expect(cardOf(o.cards, "time").metrics.find((m) => m.label.startsWith("Failed build attempts"))?.value).toBe("3");
  });

  it("splits Elsie Work Board handoffs from direct builds without guessing who pressed them", () => {
    const s = cardOf(o.cards, "sources");
    expect(s.headline.value).toBe("3 via Elsie · 5 direct"); // two receipts + one plain Codex handoff line; 7 runs minus runs 102 and 103
    expect(s.metrics[0]?.value).toBe("3");
    expect(s.metrics.find((m) => m.label.startsWith("Builds started directly"))?.value).toBe("5");
    expect(s.metrics.find((m) => m.label === "Started by John personally")?.state).toBe("not-measured");
  });

  it("finds stalled, waiting and failed-build work and ranks the top three actions", () => {
    const bn = cardOf(o.cards, "bottlenecks");
    expect(bn.metrics.find((m) => m.label.startsWith("Untouched"))?.value).toBe("1"); // the Oct 2 task is exactly 14 days old, not more
    expect(bn.metrics.find((m) => m.label === "Waiting on something")?.value).toBe("1");
    expect(bn.metrics.find((m) => m.label.startsWith("Open tasks whose build"))?.value).toBe("2");
    const actions = cardOf(o.cards, "actions");
    expect(actions.items).toHaveLength(3);
    expect(actions.items[0]?.label).toBe("1. Decide 1 approval waiting for you");
    expect(actions.items.map((i) => i.label).join(" ")).toContain("Supabase renews");
  });

  it("never shows a percent complete for projects", () => {
    const p = cardOf(o.cards, "projects");
    expect(p.metrics.find((m) => m.label === "Percent complete")?.value).toBeNull();
    expect(p.items.find((i) => i.label.startsWith("Safe Highways"))?.detail).toBe("Next: Audit public app");
    expect(p.items.find((i) => i.label === "Idea Garage")?.detail).toBe("Not in the project register");
  });
});

describe("Missing data is labelled, never zero", () => {
  const raw = fixtureRaw({
    tasks: fail, approvals: fail, changes: fail, budget: fail, usage: fail, finance: fail, projects: fail,
    builds: { claude: fail, codex: { status: "not-configured", detail: "no GitHub read connection" } },
  });
  const o = buildAnalyticsOverview(raw);

  it("gives no value to any reading that was not measured", () => {
    for (const m of allMetrics(o.cards)) {
      if (!MEASURED_STATES.includes(m.state) && m.state !== "policy") expect(m.value, m.label).toBeNull();
    }
    expect(allMetrics(o.cards).some((m) => MEASURED_STATES.includes(m.state) && m.value === "0" && m.source.includes("owner database"))).toBe(false);
  });

  it("labels each failure honestly", () => {
    expect(cardOf(o.cards, "api").headline.state).toBe("failed");
    expect(cardOf(o.cards, "money").headline.state).toBe("failed");
    expect(cardOf(o.cards, "builders").metrics.find((m) => m.label.startsWith("ChatGPT"))?.state).toBe("not-connected");
    expect(cardOf(o.cards, "health").headline.value).toBe("0 of 9 sources read just now");
    expect(cardOf(o.cards, "health").headline.tone).toBe("alert");
    expect(cardOf(o.cards, "actions").metrics.some((m) => m.label === "Sources not read for this list")).toBe(true);
    for (const c of o.cards) for (const s of c.series) expect(MEASURED_STATES).toContain(s.state);
  });
});

describe("Permissions: protected numbers need two-step sign-in", () => {
  it("hides Finance and projects at one-step sign-in and puts the code first", () => {
    const o = buildAnalyticsOverview(fixtureRaw({ aal: "aal1", finance: { status: "denied", detail: "needs two-step verification" }, projects: { status: "denied", detail: "needs two-step verification" } }));
    expect(o.signIn).toBe("one-step");
    expect(cardOf(o.cards, "money").headline).toMatchObject({ state: "needs-two-step", value: null });
    expect(cardOf(o.cards, "projects").headline.state).toBe("needs-two-step");
    expect(cardOf(o.cards, "actions").items[0]?.label).toBe("1. Enter your authenticator code");
    expect(cardOf(o.cards, "security").headline.value).toBe("Off (password only)");
  });
});

describe("Elsie gets the same readings with an explanation procedure", () => {
  const o = buildAnalyticsOverview(fixtureRaw());
  const lines = analyticsForModel(o);

  it("has one bounded line per card with state labels and sources", () => {
    expect(lines).toHaveLength(10);
    expect(lines[2]).toContain("CARD API Usage and Credits");
    expect(lines[2]).toContain("2,500 of 10,000 estimated cents (25%) [Estimate; source Office AI budget meter");
    expect(lines[1]).toContain("Office monthly running-cost ceiling: C$500.00 [Policy limit");
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(1600);
  });

  it("stays identical for identical data, so the room fingerprint does not churn", () => {
    expect(analyticsForModel(buildAnalyticsOverview(fixtureRaw()))).toEqual(lines);
  });

  it("tells Elsie how to explain simply, label honesty and consult colleagues without inventing", () => {
    for (const phrase of ["explain like he is 10", "what it measures", "never turn a missing number into zero", "second_eyes_review", "handoff_to_chatgpt_text", "Never invent a colleague's answer", "never approval to spend", "pause after every two or three cards"]) {
      expect(ANALYTICS_ELSIE_PROCEDURE).toContain(phrase);
    }
  });
});

describe("Work Board build receipts", () => {
  it("reads office-task-v2 receipts and Elsie queue markers", () => {
    const t = taskView({ id: "x", evidence: JSON.stringify({ kind: "office-task-v2", builder: "claude", state: "success", prior: "[elsie-queue claude 2026]", runId: 9 }) + "\n\n[colleague-relay …]" });
    expect(taskBuildLink(t)).toEqual({ taskId: "x", builder: "claude", runId: 9, state: "success", queuedByElsie: true });
    expect(taskBuildLink(taskView({ id: "y", evidence: "Build run 1 succeeded." }))).toBeNull();
    expect(taskBuildLink(taskView({ id: "z", evidence: "{not json" }))).toBeNull();
  });
});
