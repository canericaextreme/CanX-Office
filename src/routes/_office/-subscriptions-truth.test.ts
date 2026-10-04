/**
 * Subscriptions page truth regression (3 October 2026, narrowed 4 October 2026):
 * the static "Previous provider records" card (Lovable / Supabase / Email
 * sending) no longer renders on the visible page, and per the owner's explicit
 * follow-up the historical AI Workers September 11 snapshot card is removed
 * too. The saved SubscriptionManager list is the only subscription content
 * shown. No database or history records are touched by this display change.
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

  it("removes the AI Workers historical snapshot card", () => {
    expect(page).not.toContain("AiWorkersDetails");
    expect(page).not.toContain("AI Workers");
    expect(page).not.toContain("Historical snapshot");
    expect(page).not.toContain("September 11, 2026");
  });

  it("shows the saved SubscriptionManager list exactly once", () => {
    expect(page).toContain("<SubscriptionManager />");
    expect(page.match(/<SubscriptionManager \/>/g)).toHaveLength(1);
  });

  it("makes no green verified claim anywhere on the page", () => {
    expect(page).not.toContain('"green"');
    expect(page).not.toMatch(/tone="green"/);
  });
});
