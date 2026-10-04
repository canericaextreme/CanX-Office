import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ verifyReadback: true, row: null as null | { doc: Record<string, unknown>; updated_at: string } }));

vi.mock("./canx-backend.server", () => ({
  readBackendConfig: () => ({}),
  restRequest: vi.fn(async (_config: unknown, _token: string, path: string, init?: RequestInit) => {
    if (path === "office_audit") return { ok: true, status: 201, body: null };
    if (!init || init.method === "GET") return { ok: true, status: 200, body: state.row ? [{ doc: structuredClone(state.row.doc), updated_at: state.row.updated_at }] : [] };
    if (init.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as { doc: Record<string, unknown>; updated_at: string };
      state.row = { doc: state.verifyReadback ? body.doc : { ...body.doc, subscriptionEvidence: [] }, updated_at: body.updated_at };
      return { ok: true, status: 200, body: [{ doc: structuredClone(state.row.doc), updated_at: state.row.updated_at }] };
    }
    return { ok: false, status: 500, body: null };
  }),
}));

import { reviewRoutineEvidence } from "./subscriptions-store.server";

const routine = { id: "e1", kind: "receipt", matchStatus: "matched", subscriptionId: "s1", candidateIds: ["s1"], vendor: "Service", amount: 24, currency: "USD", documentDate: "", renewalDate: "", renewalBasis: "", mailbox: "owner@example.com", messageId: "m1", attachmentIdentity: "", from: "billing@example.com", subject: "Receipt", fingerprint: "f1", receivedAt: "2026-10-01T18:00:00Z", recordedAt: "2026-10-01T18:01:00Z", review: "needs-review" };

describe("verified routine review storage", () => {
  it("saves provenance, reads it back and is idempotent", async () => {
    state.verifyReadback = true;
    state.row = { doc: { subscriptions: [{ id: "s1", name: "Service", aliases: [], senderDomains: ["example.com"], scope: "office", cadence: "monthly", knownCost: null, nextRenewal: null, history: [], notes: "", updatedAt: "" }], subscriptionEvidence: [routine] }, updated_at: "2026-10-01T00:00:00Z" };
    const first = await reviewRoutineEvidence("token", "owner");
    expect(first).toMatchObject({ ok: true, reviewed: 1, leftForJohn: 0 });
    expect((state.row?.doc["subscriptionEvidence"] as Array<any>)[0]).toMatchObject({ review: "reviewed", reviewProvenance: { by: "elsie-deterministic" } });
    const second = await reviewRoutineEvidence("token", "owner");
    expect(second).toMatchObject({ ok: true, reviewed: 0, alreadyReviewed: 1 });
  });

  it("reports no completion when exact readback fails", async () => {
    state.verifyReadback = false;
    state.row = { doc: { subscriptions: [], subscriptionEvidence: [routine] }, updated_at: "2026-10-01T00:00:00Z" };
    expect(await reviewRoutineEvidence("token", "owner")).toEqual({ ok: false, reviewed: 0, alreadyReviewed: 0, leftForJohn: 0, items: [] });
  });
});