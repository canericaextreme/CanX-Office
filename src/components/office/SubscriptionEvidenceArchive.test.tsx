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

  it("opens the newest month first, expands older months, and filters needs-review items", () => {
    const onMark = vi.fn();
    render(<SubscriptionEvidenceArchive evidence={[
      item("September reviewed", { receivedAt: "2026-09-20T18:00:00.000Z" }),
      item("October reviewed", { receivedAt: "2026-10-02T18:00:00.000Z" }),
      item("October review", { kind: "unpaid-invoice", receivedAt: "2026-10-01T18:00:00.000Z", review: "needs-review" }),
      item("Undated review", { review: "needs-review" }),
    ]} loading={false} onMark={onMark} />);

    expect(screen.getByText(/October reviewed/)).toBeTruthy();
    expect(screen.queryByText(/September reviewed/)).toBeNull();
    const september = screen.getByRole("button", { name: /September 2026.*1 item.*0 need review/i });
    september.focus();
    expect(document.activeElement).toBe(september);
    fireEvent.click(september);
    expect(screen.getByText(/September reviewed/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Needs review (2)" }));
    expect(screen.getByRole("button", { name: "Needs review (2)" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText(/October reviewed/)).toBeNull();
    expect(screen.getByText(/October review/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Date not recorded.*1 item.*1 need review/i })).toBeTruthy();
    expect(screen.queryByText(/Undated review/)).toBeNull();
  });

  it("exposes a keyboard-ready month selector containing only months present", () => {
    render(<SubscriptionEvidenceArchive evidence={[
      item("August", { documentDate: "2026-08-15" }),
      item("October", { receivedAt: "2026-10-02T18:00:00.000Z" }),
    ]} loading={false} onMark={vi.fn()} />);
    const trigger = screen.getByRole("combobox", { name: "Filter evidence by month" });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByText("All months (2)")).toBeTruthy();
    expect(within(listbox).getByText("October 2026 (1)")).toBeTruthy();
    expect(within(listbox).getByText("August 2026 (1)")).toBeTruthy();
    expect(within(listbox).queryByText(/September/)).toBeNull();
  });

  it("filters deadlines and promotions without mixing them", () => {
    render(<SubscriptionEvidenceArchive evidence={[
      item("deadline", { kind: "deadline-notice", deadlineWhat: "domain", deadlineDate: "2026-10-20" }),
      item("promotion", { kind: "promotion" }),
      item("receipt", { kind: "receipt" }),
    ]} loading={false} onMark={vi.fn()} />);
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