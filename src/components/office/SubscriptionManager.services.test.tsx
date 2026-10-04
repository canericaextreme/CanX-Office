// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionRecord } from "@/lib/subscriptions";

vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => ({ shared: true, accessToken: "owner-token" }) }));

const SUBS: SubscriptionRecord[] = [
  {
    id: "s-1", name: "Service A", planName: "Pro Plan", aliases: [], senderDomains: [], scope: "office", cadence: "monthly",
    knownCost: { amount: 10, currency: "CAD", asOf: "2026-01-01", source: "John" },
    nextRenewal: { date: "2026-11-01", basis: "explicit", source: "John" },
    history: [], notes: "Notes A", updatedAt: ""
  },
  {
    id: "s-2", name: "Service B", planName: "", aliases: [], senderDomains: [], scope: "personal", cadence: "yearly",
    knownCost: null, nextRenewal: null, history: [], notes: "", updatedAt: ""
  },
  { id: "s-3", name: "One-time Tool", aliases: [], senderDomains: [], scope: "office", cadence: "other", recurrenceStatus: "not-recurring", knownCost: { amount: 50, currency: "USD", asOf: "2026-01-01", source: "John" }, nextRenewal: null, history: [], notes: "", updatedAt: "" },
  { id: "s-4", name: "OpenAI API", aliases: [], senderDomains: [], scope: "office", cadence: "other", recurrenceStatus: "usage-based", knownCost: null, nextRenewal: null, history: [], notes: "", updatedAt: "" },
  { id: "s-5", name: "Unknown Tool", aliases: [], senderDomains: [], scope: "office", cadence: "unknown", knownCost: null, nextRenewal: null, history: [], notes: "", updatedAt: "" },
];

vi.mock("@/lib/subscriptions.functions", () => ({
  listSubscriptions: vi.fn(async () => ({ ok: true, message: "", data: { saved: true, subscriptions: SUBS, evidence: [], lastCheck: null, scanConfig: null } })),
  saveSubscriptionList: vi.fn(async () => ({ ok: true, message: "Saved" })),
  reviewSubscriptionEvidence: vi.fn(),
}));

vi.mock("@/lib/mail-preferences.functions", () => ({
  getMailPreferences: vi.fn(async () => ({ ok: true, message: "", data: { version: 1, messages: [], senders: [] } })),
}));

import { SubscriptionManager } from "./SubscriptionManager";

afterEach(cleanup);

describe("SubscriptionManager Service Hub", () => {
  it("shows a grid of service cards in the hub", async () => {
    render(<SubscriptionManager />);
    expect(await screen.findByText("Your services")).toBeTruthy();
    expect(screen.getByText("5 services · 2 recurring · 1 not recurring · 1 usage-based · 1 unconfirmed")).toBeTruthy();
    const cardA = screen.getByRole("button", { name: /Service A: CAD \$10\.00 \/ month · Recurring — monthly/ });
    expect(cardA).toBeTruthy();
    expect(within(cardA).getByText(/Pro Plan/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /OpenAI API: Usage-based · Usage-based/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Unknown Tool: Rate unknown · Recurring status unconfirmed/ })).toBeTruthy();
  });

  it("opens service details when a card is clicked, and returns to hub on Back", async () => {
    render(<SubscriptionManager />);
    fireEvent.click(await screen.findByRole("button", { name: /Service A: CAD \$10\.00 \/ month · Recurring — monthly/ }));
    expect(screen.queryByText("Your services")).toBeNull();
    expect(screen.getByText("Service A")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Back to Subscriptions/ }));
    expect(await screen.findByText("Your services")).toBeTruthy();
  });
});
