// @vitest-environment happy-dom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RECEIPTS_KIND, RECEIPTS_SCHEMA_VERSION, type FinanceReceipt } from "@/lib/finance-receipts";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ to, children }: { to?: string; children?: React.ReactNode }) => <a href={String(to ?? "")}>{children}</a>,
}));
vi.mock("@/components/office/RoomShell", () => ({ RoomShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/office/OwnerSignIn", () => ({ OwnerSignIn: () => <div>Owner verified</div> }));
vi.mock("@/components/office/BudgetPanel", () => ({ BudgetPanel: () => <section>Existing budget controls</section> }));
// Signed in, account saving on, but the private read is refused (e.g. authenticator not entered).
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => ({ state: "owner", shared: true, accessToken: "fixture", stepUpComplete: false }) }));
const listPrivateReceipts = vi.fn();
const savePrivateReceipts = vi.fn();
vi.mock("@/lib/finance.functions", () => ({ listPrivateReceipts: (a: unknown) => listPrivateReceipts(a), savePrivateReceipts: (a: unknown) => savePrivateReceipts(a) }));
import { Finance } from "./finance";

const receipt: FinanceReceipt = {
  id: "r1", vendor: "Device Vendor", description: "Device copy", orderNumber: "O-1", date: "2026-10-02",
  subtotal: 9, tax: 1, total: 10, currency: "CAD", currencySymbol: "$", category: "Software",
  reviewStatus: "needs-review", paymentStatus: "unknown", businessUsePercent: null, notes: "",
  sourceMessageIds: ["m1"], sourceUrl: "", duplicateCount: 1,
  sourceEmailText: "", receivedAt: "2026-10-01T18:30:00Z", importedAt: "2026-10-02T00:00:00Z",
};

beforeEach(() => {
  localStorage.clear();
  listPrivateReceipts.mockReset(); savePrivateReceipts.mockReset();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.requestAnimationFrame = (cb) => { cb(0); return 1; };
});
afterEach(cleanup);

describe("Finance when saved receipts cannot be read (live 16 Oct: tile showed 0)", () => {
  it("says the receipts are not loaded instead of showing a false 0, and never saves over them", async () => {
    localStorage.setItem("canx-finance-receipts", JSON.stringify({ kind: RECEIPTS_KIND, schemaVersion: RECEIPTS_SCHEMA_VERSION, exportedAt: "2026-10-03T00:00:00Z", receipts: [receipt] }));
    listPrivateReceipts.mockResolvedValue({ ok: false, reason: "mfa_required", message: "Enter your authenticator code to read private receipts.", data: null });
    render(<Finance />);
    expect(await screen.findByRole("button", { name: /Open Receipts: Not loaded/ })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("authenticator code");

    fireEvent.click(screen.getByRole("button", { name: /Open Receipts/ }));
    fireEvent.click(screen.getByRole("button", { name: /Device Vendor/ }));
    fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: "edited" } });
    expect(savePrivateReceipts).not.toHaveBeenCalled();
    expect(screen.getByText(/have not loaded yet, so nothing was saved/)).toBeTruthy();
  });

  it("shows the saved count once the private read succeeds", async () => {
    listPrivateReceipts.mockResolvedValue({ ok: true, reason: null, message: "", data: JSON.stringify({ kind: RECEIPTS_KIND, schemaVersion: RECEIPTS_SCHEMA_VERSION, exportedAt: "2026-10-03T00:00:00Z", receipts: [receipt, { ...receipt, id: "r2", orderNumber: "O-2" }] }) });
    render(<Finance />);
    expect(await screen.findByRole("button", { name: /Open Receipts: 2\./ })).toBeTruthy();
  });
});
