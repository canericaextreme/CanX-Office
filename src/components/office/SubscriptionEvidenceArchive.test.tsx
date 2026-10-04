// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({ Link: ({ to, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => <a href={to} {...props}>{children}</a> }));

import { SubscriptionEvidenceArchive } from "./SubscriptionEvidenceArchive";
import { evidenceDate, evidenceMonthGroups, type SubscriptionEvidence } from "@/lib/subscriptions";

afterEach(cleanup);

const item = (id: string, values: Partial<SubscriptionEvidence> = {}): SubscriptionEvidence => ({
  id, kind: "renewal-notice", matchStatus: "matched", subscriptionId: "s-service", candidateIds: [], vendor: id,
  amount: null, currency: null, documentDate: "", renewalDate: "", renewalBasis: "", mailbox: "owner@example.test",
  messageId: `18f0a1b2c3${id.replace(/\W/g, "").slice(0, 2)}`, attachmentIdentity: "", from: "billing@example.test",
  subject: "Notice", fingerprint: id, recordedAt: "2026-10-03T12:00:00.000Z", review: "reviewed", ...values,
});

describe("monthly subscription evidence", () => {
  it("uses the actual received month in Whitehorse across a UTC month boundary", () => {
    const beforeLocalMidnight = item("before", { receivedAt: "2026-10-01T06:30:00.000Z" });
    const afterLocalMidnight = item("after", { receivedAt: "2026-10-01T07:30:00.000Z" });
    expect(evidenceDate(beforeLocalMidnight)).toEqual({ day: "2026-09-30", basis: "source-email" });
    expect(evidenceDate(afterLocalMidnight)).toEqual({ day: "2026-10-01", basis: "source-email" });
  });

  it("falls back only to a labelled evidence date and keeps missing dates separate", () => {
    const groups = evidenceMonthGroups([
      item("dated", { documentDate: "2026-08-15" }),
      item("undated"),
    ]);
    expect(groups.map((group) => [group.key, group.dateBasis])).toEqual([
      ["2026-08", "evidence-date"],
      ["not-recorded", "not-recorded"],
    ]);
  });

  it("hub shows month cards only; a card opens that month and Back returns", () => {
    render(<SubscriptionEvidenceArchive evidence={[
      item("September reviewed", { receivedAt: "2026-09-20T18:00:00.000Z" }),
      item("October reviewed", { receivedAt: "2026-10-02T18:00:00.000Z" }),
      item("October review", { kind: "unpaid-invoice", receivedAt: "2026-10-01T18:00:00.000Z", review: "needs-review" }),
      item("Undated review", { review: "needs-review" }),
    ]} loading={false} onMark={vi.fn()} />);
    expect(screen.queryByText(/October reviewed/)).toBeNull();
    expect(screen.queryByText(/Invoice/)).toBeNull();
    expect(screen.getByRole("button", { name: /Date not recorded: 1 item\(s\), 1 need review/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /October 2026: 2 item\(s\), 1 need review/ }));
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeTruthy();
    expect(screen.getByText(/October reviewed/)).toBeTruthy();
    expect(screen.queryByText(/September reviewed/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Needs review (1)" }));
    expect(screen.queryByText(/October reviewed/)).toBeNull();
    expect(screen.getByText(/October review/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Back to Subscriptions/ })[0]!);
    expect(screen.getByRole("button", { name: /September 2026: 1 item/ })).toBeTruthy();
    expect(screen.queryByText(/October review ·|October review/)).toBeNull();
  });

  it("focused view pages long months with a genuine count", () => {
    const many = Array.from({ length: 45 }, (_, n) => item(`Bulk ${n}`, { receivedAt: `2026-10-${String((n % 27) + 1).padStart(2, "0")}T18:00:00.000Z` }));
    render(<SubscriptionEvidenceArchive evidence={many} loading={false} onMark={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /October 2026: 45 item/ }));
    expect(screen.getByText("Showing 20 of 45.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show 20 more" }));
    expect(screen.getByText("Showing 40 of 45.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show 5 more" }));
    expect(screen.getByText("Showing 45 of 45.")).toBeTruthy();
  });

  it("keeps many months in a bounded chooser, not a giant grid", () => {
    const months = Array.from({ length: 10 }, (_, n) => item(`M${n}`, { receivedAt: `2025-${String(n + 1).padStart(2, "0")}-10T18:00:00.000Z` }));
    render(<SubscriptionEvidenceArchive evidence={months} loading={false} onMark={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /— open month$/ })).toHaveLength(6);
    expect(screen.getByRole("combobox", { name: "Open an older month" })).toBeTruthy();
    expect(screen.getByText("Older months (4)")).toBeTruthy();
  });

  it("filters deadlines and promotions without mixing them in the focused view", () => {
    render(<SubscriptionEvidenceArchive evidence={[
      item("deadline", { kind: "deadline-notice", deadlineWhat: "domain", deadlineDate: "2026-10-20" }),
      item("promotion", { kind: "promotion" }),
      item("receipt", { kind: "receipt" }),
    ]} loading={false} onMark={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Date not recorded: 3 item/ }));
    const typeFilter = screen.getByRole("combobox", { name: "Filter evidence by type" });
    fireEvent.click(typeFilter);
    fireEvent.click(screen.getByText("Deadlines and renewals"));
    expect(screen.getByText(/Service or account deadline · deadline/)).toBeTruthy();
    expect(screen.queryByText(/Promotion or offer · promotion/)).toBeNull();
    fireEvent.click(typeFilter);
    fireEvent.click(screen.getByText("Promotions and offers"));
    expect(screen.getByText(/Promotion or offer · promotion/)).toBeTruthy();
    expect(screen.queryByText(/Service or account deadline · deadline/)).toBeNull();
  });
});
