// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionRecord } from "@/lib/subscriptions";

vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => ({ shared: true, accessToken: "owner-token" }) }));

const rec = (id: string, name: string): SubscriptionRecord => ({
  id, name, planName: `${name} plan`, aliases: [], senderDomains: [], scope: "office", cadence: "monthly",
  knownCost: { amount: 10, currency: "USD", asOf: "2026-01-01", source: "John" }, nextRenewal: null, history: [], notes: "", updatedAt: "",
});
const SUBS = [rec("s-lovable", "Lovable"), rec("s-anthropic", "Anthropic"), rec("s-supabase", "Supabase"), rec("s-openai", "OpenAI")];
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

const open = async (name: string) => fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^${name}:`) }));
const nameField = () => screen.getByDisplayValue(/plan$/).closest("form")?.querySelector("input") as HTMLInputElement | null;
const editorShows = (name: string) => expect(screen.getByDisplayValue(name)).toBeTruthy();

describe("Service edit selection", () => {
  it("opens the exact selected service when switching, cancelling and reopening", async () => {
    render(<SubscriptionManager />);
    for (const name of ["Lovable", "Anthropic", "Supabase", "OpenAI"]) {
      await open(name);
      fireEvent.click(screen.getByRole("button", { name: /Edit service/ }));
      editorShows(name);
      for (const other of SUBS.filter((s) => s.name !== name)) expect(screen.queryByDisplayValue(other.name)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /Back to Subscriptions/ }));
    }
    await open("Lovable");
    expect(screen.queryByDisplayValue("Lovable")).toBeNull(); // editor not left open
    fireEvent.click(screen.getByRole("button", { name: /Edit service/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));
    fireEvent.click(screen.getByRole("button", { name: /Back to Subscriptions/ }));
    await open("OpenAI");
    fireEvent.click(screen.getByRole("button", { name: /Edit service/ }));
    editorShows("OpenAI");
    void nameField;
  });

  it("saves edits only to the intended record", async () => {
    render(<SubscriptionManager />);
    await open("Lovable");
    fireEvent.click(screen.getByRole("button", { name: /Edit service/ }));
    fireEvent.click(screen.getByRole("button", { name: /Back to Subscriptions/ }));
    await open("Supabase");
    fireEvent.click(screen.getByRole("button", { name: /Edit service/ }));
    fireEvent.change(screen.getByDisplayValue("Supabase plan"), { target: { value: "Supabase Pro" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const list = (save.mock.calls[0]![0] as { data: { subscriptions: SubscriptionRecord[] } }).data.subscriptions;
    expect(list.find((s) => s.id === "s-supabase")!.planName).toBe("Supabase Pro");
    for (const id of ["s-lovable", "s-anthropic", "s-openai"]) expect(list.find((s) => s.id === id)!.planName).toBe(SUBS.find((s) => s.id === id)!.planName);
    expect(list).toHaveLength(4);
  });
});
