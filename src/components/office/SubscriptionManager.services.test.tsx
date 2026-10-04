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
  }
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
    expect(await screen.findByText("Your services (2)")).toBeTruthy();
    
    // The label includes the rate, e.g. "Service A: CAD $10.00 / month — open service details"
    const cardA = screen.getByRole("button", { name: /Service A: CAD \$10\.00 \/ month/ });
    expect(cardA).toBeTruthy();
    expect(within(cardA).getByText("Pro Plan")).toBeTruthy();

    const cardB = screen.getByRole("button", { name: /Service B: Cost unknown/ });
    expect(cardB).toBeTruthy();
  });

  it("opens service details when a card is clicked, and returns to hub on Back", async () => {
    render(<SubscriptionManager />);
    fireEvent.click(await screen.findByRole("button", { name: /Service A: CAD \$10\.00 \/ month/ }));

    // Hub is replaced by focus view
    expect(screen.queryByText("Your services (2)")).toBeNull();
    expect(screen.getByText("Service A")).toBeTruthy();
    
    // Check form fields by clicking Edit
    fireEvent.click(screen.getByRole("button", { name: /Edit service/ }));
    expect(screen.getByLabelText("Service name")).toHaveValue("Service A");
    expect(screen.getByLabelText("Plan name (optional)")).toHaveValue("Pro Plan");

    // Click Back
    fireEvent.click(screen.getByRole("button", { name: /Back to Subscriptions/ }));
    expect(await screen.findByText("Your services (2)")).toBeTruthy();
  });

  it("can add a new service and return to hub", async () => {
    render(<SubscriptionManager />);
    fireEvent.click(await screen.findByRole("button", { name: /Add service/ }));

    // Adding a service shows the editor immediately
    expect(screen.getByLabelText("Service name")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Service name"), { target: { value: "New Service" } });
    fireEvent.change(screen.getByLabelText("Plan name (optional)"), { target: { value: "Basic" } });

    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(await screen.findByText("Your services (2)")).toBeTruthy();
  });
});
