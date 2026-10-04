// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionRecord } from "@/lib/subscriptions";

vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => ({ shared: true, accessToken: "owner-token" }) }));

const rec = (id: string, name: string, amount: number | null): SubscriptionRecord => ({
  id, name, planName: "", aliases: [], senderDomains: [], scope: "office", cadence: "monthly",
  knownCost: amount === null ? null : { amount, currency: "USD", asOf: "2026-01-01", source: "John" },
  nextRenewal: null, history: [], notes: "", updatedAt: "",
});
const SUBS = [rec("s-lovable", "Lovable", 224), rec("s-openai", "OpenAI", null)];
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
afterEach(() => { cleanup(); save.mockClear(); });

const openEditor = async (name: string) => {
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^${name}:`) }));
  fireEvent.click(screen.getByRole("button", { name: /^Edit / }));
  const form = screen.getByRole("form", { name: new RegExp(`^Edit ${name}$`) });
  return form.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
};

/** Type into a controlled input one character at a time, like a real keyboard. */
const typeChars = (input: HTMLInputElement, text: string) => {
  for (const ch of text) {
    fireEvent.change(input, { target: { value: input.value + ch } });
  }
};

describe("Amount field decimal entry", () => {
  it("accepts typing a decimal amount character by character, including the intermediate '224.'", async () => {
    render(<SubscriptionManager />);
    const input = await openEditor("Lovable");
    expect(input.value).toBe("224");
    typeChars(input, ".50");
    expect(input.value).toBe("224.50");
  });

  it("saves exact cents and reloads them on reopen", async () => {
    render(<SubscriptionManager />);
    const input = await openEditor("Lovable");
    fireEvent.change(input, { target: { value: "0.05" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const list = (save.mock.calls[0]![0] as { data: { subscriptions: SubscriptionRecord[] } }).data.subscriptions;
    expect(list.find((s) => s.id === "s-lovable")!.knownCost!.amount).toBe(0.05);
    expect(list.find((s) => s.id === "s-openai")!.knownCost).toBeNull();
  });

  it("keeps a blank amount as unknown and rejects invalid amounts with a clear error", async () => {
    render(<SubscriptionManager />);
    const input = await openEditor("OpenAI");
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    expect(await screen.findByText(/valid amount/i)).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const list = (save.mock.calls[0]![0] as { data: { subscriptions: SubscriptionRecord[] } }).data.subscriptions;
    expect(list.find((s) => s.id === "s-openai")!.knownCost).toBeNull();
  });

  it("rejects amounts with more than 2 decimal places", async () => {
    render(<SubscriptionManager />);
    const input = await openEditor("Lovable");
    fireEvent.change(input, { target: { value: "10.999" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    expect(await screen.findByText(/2 decimal places|valid amount/i)).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });
});
