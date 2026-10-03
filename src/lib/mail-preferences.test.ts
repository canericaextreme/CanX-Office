import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  applyPreferenceChange,
  cleanMailPreferences,
  EMPTY_PREFERENCES,
  normalizeSender,
  parseMailRuleCommand,
  parsePreferenceChange,
  preferenceFor,
  reviewRows,
  shouldSkipMessage,
  type MailPreferences,
  type PreferenceChange,
} from "./mail-preferences";
import { changePreferenceWith, readPreferencesWith, type MailPreferenceDeps } from "./mail-preferences.functions";
import { runMailRuleCommandWith } from "./mail-rule-command";
import { fetchGmailReceiptCandidates } from "./gmail-receipts.server";
import { runReceiptSyncWith, type SyncDeps } from "./receipt-ingestion.functions";
import type { SubscriptionEvidence } from "./subscriptions";
import { CheckEmailsResult } from "@/components/office/CheckEmailsNow";
import { MailReviewView } from "@/components/office/MailReviewPanel";

// In-memory PostgREST row honouring the conditional PATCH, for the real store + CAS.
const db = vi.hoisted(() => ({ row: null as null | { doc: Record<string, unknown>; updated_at: string }, beforePatch: null as null | (() => void), failPatch: false }));
vi.mock("./canx-backend.server", () => ({
  readBackendConfig: () => ({}),
  restRequest: async (_c: unknown, _t: string, path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (path.startsWith("office_audit")) return { ok: true, status: 201, body: null };
    if (method === "GET") return { ok: true, status: 200, body: db.row ? [{ doc: structuredClone(db.row.doc), updated_at: db.row.updated_at }] : [] };
    if (method === "PATCH") {
      db.beforePatch?.();
      db.beforePatch = null;
      if (db.failPatch) return { ok: false, status: 500, body: null };
      const seen = decodeURIComponent(/updated_at=eq\.([^&]+)/.exec(path)![1]!);
      if (!db.row || db.row.updated_at !== seen) return { ok: true, status: 200, body: [] };
      const body = JSON.parse(String(init!.body)) as { doc: Record<string, unknown>; updated_at: string };
      db.row = { doc: body.doc, updated_at: body.updated_at };
      return { ok: true, status: 200, body: [{ doc: structuredClone(db.row.doc), updated_at: db.row.updated_at }] };
    }
    return { ok: true, status: 201, body: null };
  },
}));

const at = "2026-10-03T20:00:00.000Z";
const ev = (o: Partial<SubscriptionEvidence>): SubscriptionEvidence => ({
  id: "ev", kind: "receipt", matchStatus: "matched", subscriptionId: "s1", candidateIds: [], vendor: "V", amount: null, currency: null,
  documentDate: "", renewalDate: "", renewalBasis: "", mailbox: "a@gmail.com", messageId: "m1", attachmentIdentity: "body",
  from: "Lovable <billing@lovable.dev>", subject: "Receipt", fingerprint: "f", recordedAt: at, review: "needs-review", ...o,
});
const set = (p: MailPreferences, c: PreferenceChange) => applyPreferenceChange(p, c, at, "owner-ui");

describe("mail preferences rules", () => {
  it("normalizes only one exact address", () => {
    expect(normalizeSender("Promo Team <News@Shop.COM>")).toBe("news@shop.com");
    expect(normalizeSender("not an address")).toBe("");
    expect(normalizeSender("a@b.com, c@d.com")).toBe("");
  });

  it("keep / ignore / unknown / undo with Keep precedence", () => {
    let p = cleanMailPreferences(null);
    expect(preferenceFor(p, "a@gmail.com", "m1", "x@y.com").action).toBe("none");
    p = set(p, { op: "set-sender", sender: "x@y.com", action: "ignore" });
    expect(shouldSkipMessage(p, "a@gmail.com", "m1", "X <x@y.com>")).toBe(true);
    expect(shouldSkipMessage(p, "a@gmail.com", "m1", "other@y.com")).toBe(false); // not blanket
    p = set(p, { op: "set-message", mailbox: "a@gmail.com", messageId: "m1", choice: "keep", from: "x@y.com", subject: "Invoice" });
    expect(shouldSkipMessage(p, "a@gmail.com", "m1", "x@y.com")).toBe(false); // message Keep wins
    p = set(p, { op: "clear-message", mailbox: "a@gmail.com", messageId: "m1" });
    expect(shouldSkipMessage(p, "a@gmail.com", "m1", "x@y.com")).toBe(true); // undo restores rule
    p = set(p, { op: "remove-sender", sender: "x@y.com" });
    expect(shouldSkipMessage(p, "a@gmail.com", "m1", "x@y.com")).toBe(false);
  });

  it("message choice is per mailbox: same Gmail id in two mailboxes is independent", () => {
    const p = set(EMPTY_PREFERENCES, { op: "set-message", mailbox: "A@gmail.com", messageId: "same", choice: "ignore", from: "", subject: "" });
    expect(shouldSkipMessage(p, "a@gmail.com", "same", null)).toBe(true);
    expect(shouldSkipMessage(p, "b@gmail.com", "same", null)).toBe(false);
  });

  it("rejecting one email does not create a sender rule; unknown stays needs-review", () => {
    const p = set(EMPTY_PREFERENCES, { op: "set-message", mailbox: "a@gmail.com", messageId: "m1", choice: "ignore", from: "news@shop.com", subject: "Sale" });
    expect(p.senders).toHaveLength(0);
    const rows = reviewRows([ev({ messageId: "m1", from: "news@shop.com", matchStatus: "unknown" }), ev({ messageId: "m2", from: "news@shop.com", matchStatus: "unknown" })], p);
    expect(rows.map((r) => r.category)).toEqual(["ignored", "needs-review"]);
    expect(rows[1]!.why).toMatch(/no saved service matched/);
  });

  it("rejects malformed changes and never trusts arbitrary input", () => {
    expect(parsePreferenceChange({ op: "set-sender", sender: "*@gmail.com", action: "ignore" })).toBeNull();
    expect(parsePreferenceChange({ op: "set-message", mailbox: "a", messageId: "../x", choice: "ignore" })).toBeNull();
    expect(parsePreferenceChange({ op: "drop-table" })).toBeNull();
  });

  it("Elsie commands need John's exact address; vague requests change nothing", () => {
    expect(parseMailRuleCommand("Elsie, ignore future emails from News@Shop.com")).toEqual({ kind: "set", sender: "news@shop.com", action: "ignore" });
    expect(parseMailRuleCommand("stop ignoring news@shop.com")).toEqual({ kind: "remove", sender: "news@shop.com" });
    expect(parseMailRuleCommand("ignore emails from promotions")).toEqual({ kind: "needs-address" });
    expect(parseMailRuleCommand("show my mail rules")).toEqual({ kind: "list" });
    expect(parseMailRuleCommand("What did the newsletter say about ignoring emails?")).toBeNull();
    expect(parseMailRuleCommand("Check receipts and subscriptions")).toBeNull();
  });
});

const owner = { ok: true, userId: "owner" } as never;
const denied = { ok: false, message: "Owner two-step sign-in required." } as never;

describe("mail preference server path", () => {
  it("denied owner changes nothing", async () => {
    const change = vi.fn();
    const deps: MailPreferenceDeps = { verifyOwner: async () => denied, read: async () => EMPTY_PREFERENCES, change };
    expect((await changePreferenceWith(deps, "t", { op: "remove-sender", sender: "a@b.com" }, "owner-ui")).ok).toBe(false);
    expect((await readPreferencesWith(deps, "t")).ok).toBe(false);
    expect(change).not.toHaveBeenCalled();
  });

  it("failed persistence is reported as not in effect", async () => {
    const deps: MailPreferenceDeps = { verifyOwner: async () => owner, read: async () => EMPTY_PREFERENCES, change: async () => ({ ok: false }) };
    const r = await changePreferenceWith(deps, "t", { op: "set-sender", sender: "a@b.com", action: "ignore" }, "owner-ui");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not in effect/);
  });

  it("Elsie saves only via the validated owner path and reports readback", async () => {
    const change = vi.fn(async (_t: string, _o: string, c: PreferenceChange) => ({ ok: true, preferences: applyPreferenceChange(EMPTY_PREFERENCES, c, at, "elsie-instruction") }));
    const deps: MailPreferenceDeps = { verifyOwner: async () => owner, read: async () => EMPTY_PREFERENCES, change };
    const out = await runMailRuleCommandWith(deps, "t", { kind: "set", sender: "news@shop.com", action: "ignore" });
    expect(out.ok).toBe(true);
    expect(change.mock.calls[0]![3]).toBe("elsie-instruction");
    const vague = await runMailRuleCommandWith(deps, "t", { kind: "needs-address" });
    expect(vague.text).toMatch(/Nothing was changed/);
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("real store: readback-verified, preserves concurrent keys, fails honestly", async () => {
    const store = await import("./subscriptions-store.server");
    db.row = { doc: { schemaVersion: 1, receipts: [{ id: "r1" }], subscriptions: [{ id: "s1" }], gmailContinuation: { a: { token: "t", query: "q", savedAt: "" } } }, updated_at: "2026-10-03T18:00:00.000+00:00" };
    db.beforePatch = () => { db.row = { doc: { ...db.row!.doc, subscriptionEvidence: [{ id: "e9" }] }, updated_at: "2026-10-03T18:00:05.000+00:00" }; };
    const res = await store.changeMailPreference("t", "owner", { op: "set-sender", sender: "news@shop.com", action: "ignore" }, "owner-ui");
    expect(res.ok).toBe(true);
    expect(db.row!.doc["receipts"]).toEqual([{ id: "r1" }]);
    expect(db.row!.doc["subscriptionEvidence"]).toEqual([{ id: "e9" }]);
    expect(db.row!.doc["gmailContinuation"]).toBeTruthy();
    expect(cleanMailPreferences(db.row!.doc["mailPreferences"]).senders[0]!.sender).toBe("news@shop.com");
    expect((await store.readMailPreferences("t"))!.senders).toHaveLength(1);
    db.failPatch = true;
    const failed = await store.changeMailPreference("t", "owner", { op: "remove-sender", sender: "news@shop.com" }, "owner-ui");
    db.failPatch = false;
    expect(failed.ok).toBe(false);
    expect(cleanMailPreferences(db.row!.doc["mailPreferences"]).senders).toHaveLength(1);
  });
});

function fakeGmail(messages: Record<string, { from: string; ok?: boolean }>, nextPageToken?: string) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    const json = (b: unknown, status = 200) => ({ ok: status < 300, status, json: async () => b }) as Response;
    if (url.includes("/profile")) return json({ emailAddress: "a@gmail.com" });
    if (/\/messages\?/.test(url)) return json({ messages: Object.keys(messages).map((id) => ({ id })), ...(nextPageToken ? { nextPageToken } : {}) });
    const id = /messages\/([^?/]+)/.exec(url)![1]!;
    const m = messages[id]!;
    if (m.ok === false) return json({}, 500);
    const headers = [{ name: "From", value: m.from }, { name: "Subject", value: "Your receipt" }];
    if (url.includes("format=metadata")) return json({ payload: { headers } });
    return json({ internalDate: "1759500000000", payload: { mimeType: "text/plain", headers, body: { data: Buffer.from("Receipt total CAD $10.00").toString("base64url") } } });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("ingestion applies saved choices before bodies", () => {
  it("skips ignored messages without reading bodies, counts them, keeps paging", async () => {
    let p = set(EMPTY_PREFERENCES, { op: "set-message", mailbox: "a@gmail.com", messageId: "m1", choice: "ignore", from: "", subject: "" });
    p = set(p, { op: "set-sender", sender: "news@shop.com", action: "ignore" });
    const g = fakeGmail({ m1: { from: "x@y.com" }, m2: { from: "News <news@shop.com>" }, m3: { from: "billing@lovable.dev" } }, "NEXT");
    const r = await fetchGmailReceiptCandidates({ lovableApiKey: "k", connectionApiKey: "c" }, null, false, g.fetchImpl, "q", {}, p);
    expect(r.ignored).toBe(2);
    expect(r.fetchFailures).toBe(0);
    expect(r.nextPageToken).toBe("NEXT");
    expect(r.documents.map((d) => d.messageId)).toEqual(["m3"]);
    expect(g.calls.some((c) => c.includes("m1"))).toBe(false); // message-only ignore: no fetch at all
    expect(g.calls.some((c) => c.includes("m2?format=full"))).toBe(false);
  });

  it("a metadata fetch failure is unprocessed, never counted as ignored", async () => {
    const p = set(EMPTY_PREFERENCES, { op: "set-sender", sender: "news@shop.com", action: "ignore" });
    const g = fakeGmail({ m1: { from: "x", ok: false } });
    const r = await fetchGmailReceiptCandidates({ lovableApiKey: "k", connectionApiKey: "c" }, null, false, g.fetchImpl, "q", {}, p);
    expect(r.ignored).toBe(0);
    expect(r.fetchFailures).toBe(1);
  });

  it("sync advances continuation past a page with ignored mail and reports the count truthfully", async () => {
    const saveContinuation = vi.fn(async () => true);
    const deps: SyncDeps = {
      verifyOwner: async () => owner,
      gmailAccounts: () => [{ lovableApiKey: "k", connectionApiKey: "c" }],
      readState: async () => ({ ok: true, checkpoint: null, receipts: [], subscriptions: [], evidence: [], continuation: {}, mailPreferences: EMPTY_PREFERENCES }),
      fetchCandidates: async (_s, _c, _r, _q, _t, prefs) => {
        expect(prefs).toBe(EMPTY_PREFERENCES);
        return { documents: [], checkpoint: "1", unsupported: 0, partial: true, mailbox: "a@gmail.com", nextPageToken: "NEXT", fetchFailures: 0, ignored: 3 };
      },
      saveContinuation,
      atomicWrite: async () => ({ ok: true, filed: [], duplicates: 0, allReceipts: [] }),
    };
    const r = await runReceiptSyncWith(deps, { accessToken: "t", request: "Check receipts and subscriptions" });
    expect(r.ok).toBe(true);
    expect(r.ignoredByPreference).toBe(3);
    expect(r.filed).toBe(0);
    expect(saveContinuation).toHaveBeenCalledWith("t", "owner", expect.objectContaining({ "a@gmail.com": expect.objectContaining({ token: "NEXT" }) }));
  });
});

describe("rendering", () => {
  it("running shows a static Working label; stopped partial says more mail remains and does not animate", () => {
    const running = renderToString(React.createElement(CheckEmailsResult, { state: { phase: "running" } }));
    expect(running).toContain("Working now");
    expect(running).toContain("motion-reduce:hidden"); // spinner hides, label stays
    const stopped = renderToString(React.createElement(CheckEmailsResult, { state: { phase: "done", result: {
      ok: true, code: "ok", message: "m", filed: 0, duplicatesSkipped: 0, needsReview: 0, receipts: [], totalsByCurrency: [], partial: true, mailboxesFailed: 0, ignoredByPreference: 2, mailboxes: [],
    } } }));
    expect(stopped).toContain("Stopped — more mail remains");
    expect(stopped).not.toContain("email-check-sheen");
    expect(stopped).not.toContain("Working now");
    expect(stopped).toContain("Skipped by your Ignore choices: 2");
  });

  it("review view shows filters, why, source link and sender rules", () => {
    const p = set(EMPTY_PREFERENCES, { op: "set-sender", sender: "news@shop.com", action: "ignore" });
    const html = renderToString(React.createElement(MailReviewView, {
      evidence: [ev({}), ev({ messageId: "m2", from: "news@shop.com", matchStatus: "unknown" }), ev({ messageId: "m3", from: "who@x.com", matchStatus: "unknown" })],
      prefs: p, filter: "all", onFilter: () => {}, onChange: () => {}, busy: false, note: "",
    }));
    for (const s of ["All (", "Related (", "Needs review (", "Ignored (", "Open in Gmail", "Why:", "Apply to future emails from who@x.com", "Sender rules (1)", "Change to Keep", "Remove"]) expect(html).toContain(s);
    expect(html).toContain('data-review-category="ignored"');
    expect(html).toContain('data-review-category="needs-review"');
  });
});
