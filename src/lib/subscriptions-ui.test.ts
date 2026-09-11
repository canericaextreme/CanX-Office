import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AI_WORKERS_VERIFICATION } from "@/routes/_office/subscriptions";

const subscriptionsSource = readFileSync("src/routes/_office/subscriptions.tsx", "utf8");

describe("AI Workers subscription verification", () => {
  it("keeps the supplied verified aggregate facts", () => {
    expect(AI_WORKERS_VERIFICATION).toEqual({
      spend: "$0.20",
      monthlyLimit: "$25.00",
      usage: "0.8%",
      status: "Partially verified",
      lastVerified: "September 11, 2026",
      evidence: "OpenAI Platform Usage and API key activity checked September 11, 2026.",
    });
  });

  it("exposes a full keyboard-accessible row and honest provider details", () => {
    expect(subscriptionsSource).toContain('aria-label="Open AI Workers subscription verification details"');
    expect(subscriptionsSource).toContain("Connected, billing not yet verified");
    expect(subscriptionsSource).toContain("Verify Anthropic billing/usage");
    expect(subscriptionsSource).toContain('tone="blue" label="Verified"');
    expect(subscriptionsSource).toContain("Edit verification unavailable");
    expect(subscriptionsSource).not.toMatch(/API key[:=]\s*[A-Za-z0-9_-]{16,}/);
  });
});
