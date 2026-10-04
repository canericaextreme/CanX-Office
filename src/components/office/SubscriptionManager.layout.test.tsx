// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionEvidence } from "@/lib/subscriptions";

vi.mock("@tanstack/react-router", () => ({ Link: ({ to, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => <a href={to} {...props}>{children}</a> }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => ({ shared: true, accessToken: "owner-token" }) }));

const KINDS: SubscriptionEvidence["kind"][] = ["receipt", "unpaid-invoice", "renewal-notice", "promotion", "deadline-notice", "failed-payment"];
const MONTHS = ["2026-10", "2026-09", "2026-08"];
// 120 saved items spread over three real months (40 each); every third item needs review.
const EVIDENCE: SubscriptionEvidence[] = Array.from({ length: 120 }, (_, i) => {
  const month = MONTHS[i % 3]!;
  const day = String((i % 27) + 1).padStart(2, "0");
  return {
    id: `ev-${i}`, kind: KINDS[i % KINDS.length]!, matchStatus: "unknown", subscriptionId: null, candidateIds: [],
    vendor: `Vendor ${i}`, amount: i % 2 ? 10 + i : null, currency: i % 2 ? "CAD" : null, documentDate: "", renewalDate: "",
    renewalBasis: "", mailbox: "owner@example.test", messageId: `18f0a1b2c3${String(i).padStart(3, "0")}`, attachmentIdentity: "",
    from: `billing${i}@vendor.test`, subject: `Notice ${i}`, fingerprint: `fp-${i}`,
    receivedAt: `${month}-${day}T18:00:00.000Z`, recordedAt: "2026-10-03T12:00:00.000Z",
    review: i % 3 === 0 ? "needs-review" : "reviewed",
  } as SubscriptionEvidence;
});

vi.mock("@/lib/subscriptions.functions", () => ({
  listSubscriptions: vi.fn(async () => ({ ok: true, message: "", data: { saved: true, subscriptions: [], evidence: EVIDENCE, lastCheck: null, scanConfig: null } })),
  saveSubscriptionList: vi.fn(), reviewSubscriptionEvidence: vi.fn(),
}));
vi.mock("@/lib/mail-preferences.functions", () => ({
  getMailPreferences: vi.fn(async () => ({ ok: true, message: "", data: { version: 1, messages: [], senders: [] } })),
  setMailPreference: vi.fn(),
}));
vi.mock("@/lib/receipt-ingestion.functions", () => ({ syncGmailReceipts: vi.fn() }));

import { SubscriptionManager } from "./SubscriptionManager";

afterEach(cleanup);

/** True when `a` comes before `b` in document order. */
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("Subscriptions room layout with 120 saved emails", () => {
  it("hub shows compact month cards with counts and no email evidence rows", async () => {
    render(<SubscriptionManager />);
    const oct = await screen.findByRole("button", { name: /^October 2026: 40 item\(s\), \d+ need review — open month$/ });
    expect(screen.getByRole("button", { name: /^September 2026: 40 item\(s\)/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^August 2026: 40 item\(s\)/ })).toBeTruthy();
    // No evidence rows, invoice labels or vendor lines on the hub.
    expect(screen.queryByText(/Invoice — amount due as stated/)).toBeNull();
    expect(screen.queryByText(/Vendor \d+/)).toBeNull();
    expect(screen.queryByRole("region", { name: "This week in subscriptions" })).toBeNull();
    // Category cards and month cards sit before the folded mail review.
    const mailReview = screen.getByText(/Saved mail review and Ignore rules \(120 saved email/);
    expect(before(oct, mailReview)).toBe(true);
    expect(before(screen.getByRole("button", { name: /^Needs review: 40 — open list$/ }), oct)).toBe(true);
  });

  it("a month card opens only that month, with filters, and Back returns to the compact hub", async () => {
    render(<SubscriptionManager />);
    fireEvent.click(await screen.findByRole("button", { name: /^September 2026: 40 item/ }));
    const view = screen.getByRole("region", { name: "Billing evidence from email" });
    expect(within(view).getByRole("heading", { name: "September 2026" })).toBeTruthy();
    expect(within(view).getByRole("combobox", { name: "Filter evidence by type" })).toBeTruthy();
    expect(within(view).getByRole("button", { name: /^Needs review \(\d+\)$/ })).toBeTruthy();
    expect(within(view).getByText("Showing 20 of 40.")).toBeTruthy();
    expect(within(view).getAllByRole("listitem")).toHaveLength(20);
    within(view).getAllByRole("listitem").forEach((li) => expect(li.textContent).toMatch(/2026-09|Sep/));
    // The hub (month cards, mail review) is replaced, not stacked above.
    expect(screen.queryByRole("button", { name: /^October 2026: 40 item/ })).toBeNull();
    expect(screen.queryByText(/Saved mail review and Ignore rules/)).toBeNull();

    fireEvent.click(within(view).getAllByRole("button", { name: /Back to Subscriptions/ })[0]!);
    expect(await screen.findByRole("button", { name: /^October 2026: 40 item/ })).toBeTruthy();
    expect(screen.queryByText(/Vendor \d+/)).toBeNull();
  });

  it("a category card opens a filtered list across months", async () => {
    render(<SubscriptionManager />);
    fireEvent.click(await screen.findByRole("button", { name: /^Promotions & offers: 20 — open list$/ }));
    const view = screen.getByRole("region", { name: "Billing evidence from email" });
    within(view).getAllByRole("listitem").forEach((li) => expect(li.textContent).toContain("Promotion or offer"));
    expect(within(view).getByText("Showing 20 of 20.")).toBeTruthy();
  });
});
