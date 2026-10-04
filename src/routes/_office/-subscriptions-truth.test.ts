/**
 * Subscriptions page truth regression (3 October 2026, narrowed 4 October 2026):
 * the static "Previous provider records" card (Lovable / Supabase / Email
 * sending) no longer renders on the visible page. The saved SubscriptionManager
 * list is the only subscription list shown. The historical AI Workers card
 * stays visible with its dated snapshot labels.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/routes/_office/subscriptions.tsx", "utf8");

describe("Subscriptions page shows no static provider-records card", () => {
  it("removes the Previous provider records heading, note and static rows", () => {
    expect(page).not.toContain("Previous provider records");
    expect(page).not.toContain("Provider status");
    expect(page).not.toContain("const SUBS");
    expect(page).not.toContain("Email sending");
    expect(page).not.toContain("Static record; billing not verified here");
  });

  it("shows the saved SubscriptionManager list exactly once", () => {
    expect(page).toContain("<SubscriptionManager />");
    expect(page.match(/<SubscriptionManager \/>/g)).toHaveLength(1);
  });

  it("keeps the AI Workers card visible with its historical labels", () => {
    expect(page).toContain("<AiWorkersDetails />");
    expect(page).toContain('aria-label="Open AI Workers subscription verification details"');
    expect(page).toContain("Historical snapshot — not current");
    expect(page).toContain("Current spend is unknown");
    expect(page).toContain("Unknown — not verified");
  });

  it("renders the AI Workers card below the saved list, not above it", () => {
    expect(page.indexOf("<SubscriptionManager />")).toBeLessThan(page.indexOf("<AiWorkersDetails />"));
  });

  it("makes no green verified claim anywhere on the page", () => {
    expect(page).not.toContain('"green"');
    expect(page).not.toMatch(/tone="green"/);
  });
});
