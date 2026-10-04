import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const subscriptionsSource = readFileSync("src/routes/_office/subscriptions.tsx", "utf8");

describe("Subscriptions page keeps no static provider records", () => {
  it("removes the AI Workers historical snapshot card entirely (owner request, 4 October 2026)", () => {
    expect(subscriptionsSource).not.toContain("AI_WORKERS_VERIFICATION");
    expect(subscriptionsSource).not.toContain("AiWorkersDetails");
    expect(subscriptionsSource).not.toContain("AI Workers");
    expect(subscriptionsSource).not.toContain("September 11, 2026");
  });

  it("never presents any static figure as current verified spend", () => {
    expect(subscriptionsSource).not.toContain("Current verified spend");
    expect(subscriptionsSource).not.toMatch(/API key[:=]\s*[A-Za-z0-9_-]{16,}/);
  });

  it("keeps the saved SubscriptionManager list as the only subscription content", () => {
    expect(subscriptionsSource).toContain("<SubscriptionManager />");
    expect(subscriptionsSource).not.toContain("Supabase (proposed)");
    expect(subscriptionsSource).not.toContain("Static record; billing not verified here");
  });
});
