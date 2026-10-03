/**
 * Subscriptions page truth regression (3 October 2026): the hardcoded
 * infrastructure card must not masquerade as a live/verified provider list.
 * The saved SubscriptionManager list is authoritative; the static card is
 * renamed "Previous provider records", carries no green verified claims, and
 * labels its status unknown / not current.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/routes/_office/subscriptions.tsx", "utf8");

describe("Subscriptions page shows no false live verification", () => {
  it("renames the static card to Previous provider records", () => {
    expect(page).toContain("Previous provider records");
    expect(page).not.toContain("Provider status");
  });

  it("keeps the saved SubscriptionManager list as the authoritative display", () => {
    expect(page).toContain("<SubscriptionManager />");
    expect(page).toContain("authoritative");
  });

  it("makes no green verified claim for static infrastructure entries", () => {
    const subsBlock = page.slice(page.indexOf("const SUBS"), page.indexOf("];", page.indexOf("const SUBS")));
    expect(subsBlock).not.toContain('"green"');
    expect(subsBlock).not.toMatch(/status:\s*"yellow"/);
  });

  it("labels static records as unknown / not current", () => {
    expect(page).toContain("Unknown — not verified");
    expect(page).toContain("not current");
  });

  it("keeps the AI Workers snapshot explicitly historical", () => {
    expect(page).toContain("Historical snapshot — not current");
    expect(page).toContain("Current spend is unknown");
  });
});
