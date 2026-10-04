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
  it("puts Month, Evidence type and Needs review before every long list, grouped by month", async () => {
    render(<SubscriptionManager />);
    const month = await screen.findByRole("combobox", { name: "Filter evidence by month" });
    await waitFor(() => expect(screen.getByRole("button", { name: /^Needs review \(40\)$/ })).toBeTruthy());
    const type = screen.getByRole("combobox", { name: "Filter evidence by type" });
    const review = screen.getByRole("button", { name: /^Needs review \(40\)$/ });

    const weekly = screen.getByRole("region", { name: "This week in subscriptions" });
    const mailReview = screen.getByText(/Saved mail review and Ignore rules \(120 saved email/);
    for (const control of [month, type, review]) {
      expect(before(control, weekly)).toBe(true);
      expect(before(control, mailReview)).toBe(true);
    }

    // Three real month groups; only the newest is open, older months are collapsed.
    const archive = screen.getByRole("region", { name: "Billing evidence from email" });
    const oct = within(archive).getByRole("button", { name: /October 2026.*40 item\(s\).*need review/ });
    const sep = within(archive).getByRole("button", { name: /September 2026.*40 item\(s\)/ });
    const aug = within(archive).getByRole("button", { name: /August 2026.*40 item\(s\)/ });
    expect(oct.getAttribute("aria-expanded")).toBe("true");
    expect(sep.getAttribute("aria-expanded")).toBe("false");
    expect(aug.getAttribute("aria-expanded")).toBe("false");
    expect(within(archive).getAllByRole("listitem")).toHaveLength(40);

    // Long weekly/alert lists are folded away and, when opened, labelled rather than silently cut.
    const details = weekly.querySelectorAll("details");
    expect(details).toHaveLength(2);
    details.forEach((d) => expect(d.open).toBe(false));
    expect(within(weekly).getByText(/Alerts waiting for review \(\d+\)/)).toBeTruthy();
    expect(within(weekly).getByText(/Showing 5 of \d+ alerts\./)).toBeTruthy();
  });

  it("category cards open the month list with the matching filter", async () => {
    render(<SubscriptionManager />);
    const card = await screen.findByRole("button", { name: /^Needs review: 40 — open in month list$/ });
    const archive = screen.getByRole("region", { name: "Billing evidence from email" });
    expect(before(card, archive)).toBe(true);
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Needs review \(40\)$/ }).getAttribute("aria-pressed")).toBe("true"));
    within(archive).getAllByRole("listitem").forEach((li) => expect(li.textContent).toContain("Needs review"));

    fireEvent.click(screen.getByRole("button", { name: /^Promotions & offers: 20 — open in month list$/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Needs review \(40\)$/ }).getAttribute("aria-pressed")).toBe("false"));
    const items = within(archive).getAllByRole("listitem");
    expect(items.length).toBeGreaterThan(0);
    items.forEach((li) => expect(li.textContent).toContain("Promotion or offer"));
  });
});
