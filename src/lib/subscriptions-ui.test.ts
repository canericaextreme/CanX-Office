import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AI_WORKERS_VERIFICATION } from "@/routes/_office/subscriptions";

const subscriptionsSource = readFileSync("src/routes/_office/subscriptions.tsx", "utf8");

describe("AI Workers subscription verification", () => {
  it("keeps the September 11 numbers only as a dated historical snapshot", () => {
    expect(AI_WORKERS_VERIFICATION).toEqual({
      spend: "$0.20 USD",
      monthlyLimit: "$25.00 USD",
      usage: "0.8%",
      status: "Historical snapshot — not current",
      lastVerified: "September 11, 2026",
      snapshotLabel: "Historical snapshot from September 11, 2026. Current spend is unknown.",
      managerAiPolicyLimit: "C$100 / month",
      evidence:
        "OpenAI Platform Usage and API key activity checked September 11, 2026. Not re-checked since, so current billing is unknown.",
    });
  });

  it("never presents the snapshot as current verified spend", () => {
    expect(subscriptionsSource).not.toContain("Current verified spend");
    expect(subscriptionsSource).toContain('<Detail label="Current spend" value="Unknown — not verified" />');
  });

  it("exposes a full keyboard-accessible row and honest provider details", () => {
    expect(subscriptionsSource).toContain('aria-label="Open AI Workers subscription verification details"');
    expect(subscriptionsSource).toContain('StatusBadge tone="grey" label="Billing not verified"');
    expect(subscriptionsSource).toContain("Verify Anthropic billing/usage");
    expect(subscriptionsSource).toContain("See live check in Systems & Connections");
    expect(subscriptionsSource).toContain("Edit verification unavailable");
    expect(subscriptionsSource).not.toMatch(/API key[:=]\s*[A-Za-z0-9_-]{16,}/);
  });

  it("no longer calls Supabase proposed and marks its billing unverified", () => {
    expect(subscriptionsSource).not.toContain("Supabase (proposed)");
    expect(subscriptionsSource).toContain("Billing not verified here.");
  });

  it("labels the C$100 Manager AI figure as an internal policy limit", () => {
    expect(subscriptionsSource).toContain("Manager AI internal policy limit");
    expect(subscriptionsSource).toContain("internal policy limit set in this office, not a provider bill");
  });
});
