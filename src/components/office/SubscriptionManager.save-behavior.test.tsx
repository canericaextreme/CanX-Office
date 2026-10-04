// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionRecord } from "@/lib/subscriptions";

vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => ({ shared: true, accessToken: "owner-token" }) }));

const rec = (id: string, name: string): SubscriptionRecord => ({
  id, name, planName: "", aliases: [], senderDomains: [], scope: "office", cadence: "monthly",
  knownCost: { amount: 10, currency: "USD", asOf: "2026-01-01", source: "John" },
  nextRenewal: null, history: [], notes: "", updatedAt: "",
});
const SUBS = [rec("s-lovable", "Lovable"), rec("s-openai", "OpenAI")];
const save = vi.fn(async (_: unknown) => ({ ok: true, message: "Saved" }));

vi.mock("@/lib/subscriptions.functions", () => ({
  listSubscriptions: vi.fn(async () => ({ ok: true, message: "", data: { saved: true, subscriptions: SUBS, evidence: [], lastCheck: null, scanConfig: null } })),
  saveSubscriptionList: (arg: unknown) => save(arg),
  reviewSubscriptionEvidence: vi.fn(),
}));
vi.mock("@/lib/mail-preferences.functions", () => ({
  getMailPreferences: vi.fn(async () => ({ ok: true, message: "", data: { version: 1, messages: [], senders: [] } })),
}));

import { SubscriptionManager } from "./SubscriptionManager";
afterEach(() => { cleanup(); save.mockReset(); });

const openEditor = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /^Lovable:/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Edit / }));
};

describe("Save behavior", () => {
  it("closes the editor and shows Saved after a verified save", async () => {
    save.mockResolvedValue({ ok: true, message: "Saved" });
    render(<SubscriptionManager />);
    await openEditor();
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("form", { name: /^Edit Lovable$/ })).toBeNull());
    expect(await screen.findByText("Saved.")).toBeTruthy();
    // Back on the service read view
    expect(screen.getByRole("button", { name: /^Edit Lovable$/ })).toBeTruthy();
  });

  it("keeps the form and entered values open with a clear error when the save fails", async () => {
    save.mockResolvedValue({ ok: false, message: "Save failed: not verified" });
    render(<SubscriptionManager />);
    await openEditor();
    const amount = screen.getByRole("form", { name: /^Edit Lovable$/ }).querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    fireEvent.change(amount, { target: { value: "224.50" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    // Form stays open, draft preserved, error shown
    expect(screen.getByRole("form", { name: /^Edit Lovable$/ })).toBeTruthy();
    expect(amount.value).toBe("224.50");
    expect(await screen.findByText("Save failed: not verified")).toBeTruthy();
  });
});
