// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RECEIPTS_KIND, RECEIPTS_SCHEMA_VERSION, type FinanceReceipt } from "@/lib/finance-receipts";

vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("@/components/office/RoomShell", () => ({ RoomShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/office/OwnerSignIn", () => ({ OwnerSignIn: () => <div>Owner verified</div> }));
vi.mock("@/components/office/BudgetPanel", () => ({ BudgetPanel: () => <section>Existing budget controls</section> }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => ({ state: "owner", shared: false, accessToken: "fixture", stepUpComplete: true }) }));
vi.mock("@/lib/finance.functions", () => ({ listPrivateReceipts: vi.fn(), savePrivateReceipts: vi.fn() }));
import { Finance } from "./finance";

const receipt: FinanceReceipt = {
  id: "r1", vendor: "Real Vendor", description: "Existing service", orderNumber: "O-7", date: "2026-10-02",
  subtotal: 90, tax: 10, total: 100, currency: "CAD", currencySymbol: "$", category: "Software",
  reviewStatus: "needs-review", paymentStatus: "unknown", businessUsePercent: 75, notes: "Owner note",
  sourceMessageIds: ["m1"], sourceUrl: "https://example.test/source", duplicateCount: 1,
  sourceEmailText: "Stored source evidence", importedAt: "2026-10-02T00:00:00Z",
};

const saveFixture = (receipts: FinanceReceipt[]) => localStorage.setItem("canx-finance-receipts", JSON.stringify({ kind: RECEIPTS_KIND, schemaVersion: RECEIPTS_SCHEMA_VERSION, exportedAt: "2026-10-03T00:00:00Z", receipts }));

beforeEach(() => { localStorage.clear(); window.HTMLElement.prototype.scrollIntoView = vi.fn(); window.requestAnimationFrame = (cb) => { cb(0); return 1; }; });
afterEach(cleanup);

describe("Finance category navigation", () => {
  for (const [label, heading, empty] of [
    ["Income", "Income records", "No reconciled income records"],
    ["Expenses", "Expense records", "No connected payment source"],
    ["Tax prep", "Tax preparation records", "No receipt records are available"],
  ] as const) {
    it(`${label} opens by click with an honest state and returns to Finance`, () => {
      render(<Finance />);
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`Open ${label}`) }));
      expect(screen.getByRole("heading", { name: label })).toBeTruthy();
      expect(screen.getByText(heading)).toBeTruthy();
      expect(screen.getByText(new RegExp(empty))).toBeTruthy();
      expect(screen.queryByRole("navigation", { name: "Finance categories" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Back to Finance" }));
      expect(screen.getByRole("navigation", { name: "Finance categories" })).toBeTruthy();
    });
  }

  it("Receipts opens from the keyboard and a saved receipt opens its real details", () => {
    saveFixture([receipt]);
    render(<Finance />);
    const category = screen.getByRole("button", { name: /Open Receipts/ });
    category.focus();
    fireEvent.keyDown(category, { key: "Enter" });
    fireEvent.click(category);
    expect(screen.getByRole("heading", { name: "Receipts" })).toBeTruthy();
    const row = screen.getByRole("button", { name: /Real Vendor/ });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/Order: O-7/)).toBeTruthy();
    expect(screen.getByText("Stored source evidence")).toBeTruthy();
    expect(screen.getByDisplayValue("Owner note")).toBeTruthy();
  });

  it("Receipts opens even when empty", () => {
    render(<Finance />);
    fireEvent.click(screen.getByRole("button", { name: /Open Receipts/ }));
    expect(screen.getByText(/No receipts have been imported/)).toBeTruthy();
  });
});