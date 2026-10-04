// @vitest-environment happy-dom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanWebsiteUrl, type SubscriptionRecord } from "@/lib/subscriptions";

vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => ({ shared: true, accessToken: "owner-token" }) }));

const rec = (id: string, name: string, websiteUrl?: string): SubscriptionRecord => ({
  id, name, planName: `${name} plan`, aliases: [], senderDomains: [], scope: "office", cadence: "monthly",
  knownCost: { amount: 10, currency: "USD", asOf: "2026-01-01", source: "John" }, nextRenewal: null, history: [], notes: "",
  ...(websiteUrl ? { websiteUrl } : {}), updatedAt: "",
});
const SUBS = [rec("s-lovable", "Lovable", "https://lovable.dev/"), rec("s-supabase", "Supabase"), rec("s-openai", "OpenAI")];
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

describe("cleanWebsiteUrl", () => {
  it("accepts only http/https and rejects everything else", () => {
    expect(cleanWebsiteUrl("https://lovable.dev")).toBe("https://lovable.dev/");
    expect(cleanWebsiteUrl("http://example.com/page")).toBe("http://example.com/page");
    expect(cleanWebsiteUrl("javascript:alert(1)")).toBeUndefined();
    expect(cleanWebsiteUrl("ftp://example.com")).toBeUndefined();
    expect(cleanWebsiteUrl("not a url")).toBeUndefined();
    expect(cleanWebsiteUrl("")).toBeUndefined();
    expect(cleanWebsiteUrl(undefined)).toBeUndefined();
  });
});

describe("Service website link", () => {
  it("shows an Open website link only when a URL is saved, per service", async () => {
    render(<SubscriptionManager />);
    await open("Lovable");
    const link = screen.getByRole("link", { name: /Open the Lovable website/ });
    expect(link.getAttribute("href")).toBe("https://lovable.dev/");
    expect(link.getAttribute("target")).toBe("_blank");
    fireEvent.click(screen.getByRole("button", { name: /Back to Subscriptions/ }));
    await open("Supabase");
    expect(screen.queryByRole("link", { name: /Open the .* website/ })).toBeNull();
  });

  it("saves a valid URL to the selected service only, and reload keeps it", async () => {
    render(<SubscriptionManager />);
    await open("Supabase");
    fireEvent.click(screen.getByRole("button", { name: /^Edit / }));
    fireEvent.change(screen.getByLabelText(/Website link/), { target: { value: "https://supabase.com/dashboard" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const list = (save.mock.calls[0]![0] as { data: { subscriptions: SubscriptionRecord[] } }).data.subscriptions;
    expect(list.find((s) => s.id === "s-supabase")!.websiteUrl).toBe("https://supabase.com/dashboard");
    expect(list.find((s) => s.id === "s-lovable")!.websiteUrl).toBe("https://lovable.dev/");
    expect(list.find((s) => s.id === "s-openai")!.websiteUrl).toBeUndefined();
  });

  it("rejects an invalid URL with a message and does not save", async () => {
    render(<SubscriptionManager />);
    await open("OpenAI");
    fireEvent.click(screen.getByRole("button", { name: /^Edit / }));
    fireEvent.change(screen.getByLabelText(/Website link/), { target: { value: "not a url" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    expect(await screen.findByRole("alert").then?.(() => true) ?? true).toBeTruthy();
    expect(screen.getByText(/starting with http/)).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it("editor shows the saved URL of the service being edited when switching", async () => {
    render(<SubscriptionManager />);
    await open("Lovable");
    fireEvent.click(screen.getByRole("button", { name: /^Edit / }));
    expect((screen.getByLabelText(/Website link/) as HTMLInputElement).value).toBe("https://lovable.dev/");
    fireEvent.click(screen.getByRole("button", { name: /Back to Subscriptions/ }));
    await open("OpenAI");
    fireEvent.click(screen.getByRole("button", { name: /^Edit / }));
    expect((screen.getByLabelText(/Website link/) as HTMLInputElement).value).toBe("");
  });
});
