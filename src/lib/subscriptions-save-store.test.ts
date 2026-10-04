import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Realistic stand-in for the owner's private finance document: every write
 * goes through JSON (as jsonb does), so keys holding `undefined` vanish and
 * object key order is not preserved. No live service is contacted.
 */
const db = vi.hoisted(() => ({
  row: null as null | { doc: Record<string, unknown>; updated_at: string },
  patchMode: "ok" as "ok" | "denied" | "error",
}));

const jsonb = (v: unknown) => JSON.parse(JSON.stringify(v)) as Record<string, unknown>;

vi.mock("./canx-backend.server", () => ({
  readBackendConfig: () => ({}),
  restRequest: vi.fn(async (_c: unknown, _t: string, path: string, init?: RequestInit) => {
    if (path === "office_audit") return { ok: true, status: 201, body: null };
    if (!init || !init.method || init.method === "GET") {
      return { ok: true, status: 200, body: db.row ? [{ doc: jsonb(db.row.doc), updated_at: db.row.updated_at }] : [] };
    }
    if (init.method === "PATCH") {
      if (db.patchMode === "error") return { ok: false, status: 403, body: null };
      // Row security hiding the row: PostgREST returns zero rows, nothing written.
      if (db.patchMode === "denied") return { ok: true, status: 200, body: [] };
      const body = JSON.parse(String(init.body)) as { doc: Record<string, unknown>; updated_at: string };
      db.row = { doc: jsonb(body.doc), updated_at: body.updated_at };
      return { ok: true, status: 200, body: [{ doc: jsonb(db.row.doc), updated_at: db.row.updated_at }] };
    }
    return { ok: false, status: 500, body: null };
  }),
}));

import { readSubscriptionState, saveSubscriptions } from "./subscriptions-store.server";
import { cleanSubscriptionList } from "./subscriptions";
import { SAVE_FAILURE_MESSAGES } from "./subscriptions.functions";

const LOVABLE_URL = "https://lovable.dev/projects/52572715-7d7c-4c7a-85cb-96664ada3394?view=settings";
const receipts = [{ id: "r1", vendor: "Lovable", amount: 326.99, currency: "CAD" }];
const original = () => [
  { id: "s-lovable", name: "Lovable", aliases: ["lovable"], senderDomains: ["lovable.dev"], scope: "office", cadence: "unknown", knownCost: null, nextRenewal: null, history: [], notes: "", updatedAt: "2026-10-01T00:00:00Z" },
  { id: "s-github", name: "GitHub", aliases: [], senderDomains: ["github.com"], scope: "office", cadence: "monthly", knownCost: null, nextRenewal: null, history: [], notes: "", websiteUrl: "https://github.com/", updatedAt: "2026-10-01T00:00:00Z" },
  { id: "s-supabase", name: "Supabase", aliases: [], senderDomains: ["supabase.com"], scope: "office", cadence: "monthly", knownCost: null, nextRenewal: null, history: [], notes: "", updatedAt: "2026-10-01T00:00:00Z" },
];

/** The full edit the owner made, as the editor submits it (fictional test copy). */
function editedList() {
  const list = cleanSubscriptionList(original())!;
  return list.map((s) => s.id !== "s-lovable" ? s : {
    ...s,
    planName: "Pro — 800 credits / month",
    cadence: "monthly" as const,
    recurrenceStatus: "recurring" as const,
    recurrenceSource: "John",
    knownCost: { amount: 224, currency: "USD", asOf: "2026-10-04", source: "John" },
    nextRenewal: { date: "2026-10-30", basis: "explicit" as const, source: "John" },
    notes: "Charged CAD 326.99 after conversion.",
    websiteUrl: LOVABLE_URL,
  });
}

beforeEach(() => {
  db.patchMode = "ok";
  db.row = { doc: { schemaVersion: 1, kind: "finance-receipts", receipts, subscriptions: original() }, updated_at: "2026-10-01T00:00:00Z" };
});

describe("full service save, readback and reopen", () => {
  it("saves plan, cost, currency, cycle, renewal and website, and reads them all back", async () => {
    const res = await saveSubscriptions("token", "owner", editedList());
    expect(res).toEqual({ ok: true });
    const state = await readSubscriptionState("token");
    const lovable = state!.subscriptions.find((s) => s.id === "s-lovable")!;
    expect(lovable).toMatchObject({
      planName: "Pro — 800 credits / month",
      cadence: "monthly",
      recurrenceStatus: "recurring",
      knownCost: { amount: 224, currency: "USD" },
      nextRenewal: { date: "2026-10-30", basis: "explicit" },
      websiteUrl: LOVABLE_URL,
    });
    // Other services and the receipts are untouched.
    expect(state!.subscriptions.find((s) => s.id === "s-github")?.websiteUrl).toBe("https://github.com/");
    expect(state!.subscriptions.find((s) => s.id === "s-supabase")?.websiteUrl).toBeUndefined();
    expect(db.row!.doc["receipts"]).toEqual(receipts);
  });

  it("a second save after reopening keeps every field (no re-entry needed)", async () => {
    await saveSubscriptions("token", "owner", editedList());
    const reopened = (await readSubscriptionState("token"))!.subscriptions;
    const again = reopened.map((s) => s.id === "s-lovable" ? { ...s, notes: "Second edit" } : s);
    expect(await saveSubscriptions("token", "owner", again)).toEqual({ ok: true });
    const lovable = (await readSubscriptionState("token"))!.subscriptions.find((s) => s.id === "s-lovable")!;
    expect(lovable.knownCost?.amount).toBe(224);
    expect(lovable.websiteUrl).toBe(LOVABLE_URL);
    expect(lovable.notes).toBe("Second edit");
  });

  it("reports a refused write with an actionable reason and leaves stored data unchanged", async () => {
    db.patchMode = "error";
    const before = structuredClone(db.row);
    const res = await saveSubscriptions("token", "owner", editedList());
    expect(res).toEqual({ ok: false, reason: "write_failed" });
    expect(SAVE_FAILURE_MESSAGES[res.ok ? "aborted" : res.reason]).toMatch(/Sign in again/);
    expect(db.row).toEqual(before);
  });

  it("reports a hidden row (zero rows updated) as not saved, never as saved", async () => {
    db.patchMode = "denied";
    const res = await saveSubscriptions("token", "owner", editedList());
    expect(res).toEqual({ ok: false, reason: "conflict" });
    expect((await readSubscriptionState("token"))!.subscriptions.find((s) => s.id === "s-lovable")?.knownCost).toBeNull();
  });
});
