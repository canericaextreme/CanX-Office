import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { CHECK_EMAILS_NOW_REQUEST, createCheckEmailsController, type CheckState } from "./check-emails-now";
import { isExplicitReceiptSyncRequest, type ReceiptSyncResult } from "./receipt-ingestion.functions";
import { CheckEmailsResult } from "@/components/office/CheckEmailsNow";

const ok = (o: Partial<ReceiptSyncResult> = {}): ReceiptSyncResult => ({
  ok: true, code: "ok", message: "Receipt review finished.", filed: 2, duplicatesSkipped: 1, needsReview: 2, receipts: [], totalsByCurrency: [],
  partial: true, mailboxesChecked: 1, mailboxesFailed: 1, subscriptionEvidenceAdded: 3, subscriptionEvidenceDuplicates: 4, sentToReview: 1,
  mailboxes: [
    { mailbox: "canericaextreme@gmail.com", status: "read", partial: true, documents: 25 },
    { mailbox: "Linked mailbox 2", status: "authorization_required", partial: true, documents: 0 },
  ], ...o,
});

describe("Check emails now button", () => {
  it("sends the same command Elsie accepts", () => {
    expect(isExplicitReceiptSyncRequest(CHECK_EMAILS_NOW_REQUEST)).toBe(true);
  });
  it("blocks double-submit and refreshes only after a verified result", async () => {
    let release!: (r: ReceiptSyncResult) => void;
    const run = vi.fn(() => new Promise<ReceiptSyncResult>((r) => { release = r; }));
    const states: CheckState[] = [];
    const onVerified = vi.fn();
    const c = createCheckEmailsController({ run, onState: (s) => states.push(s), onVerified });
    const first = c.start();
    expect(await c.start()).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(CHECK_EMAILS_NOW_REQUEST);
    release(ok());
    await first;
    expect(states.map((s) => s.phase)).toEqual(["running", "done"]);
    expect(onVerified).toHaveBeenCalledTimes(1);
    expect(c.running).toBe(false);
  });
  it("does not refresh or claim success on denial or thrown error", async () => {
    const states: CheckState[] = [];
    const onVerified = vi.fn();
    const denied = createCheckEmailsController({ run: async () => ({ ...ok(), ok: false, code: "auth_not_ready", message: "Owner two-step sign-in required." }), onState: (s) => states.push(s), onVerified });
    await denied.start();
    const thrown = createCheckEmailsController({ run: async () => { throw new Error("net"); }, onState: (s) => states.push(s), onVerified });
    await thrown.start();
    expect(onVerified).not.toHaveBeenCalled();
    expect(states.filter((s) => s.phase === "failed")).toHaveLength(2);
  });
  it("shows source-specific counts and partial/limit status", () => {
    const html = renderToString(React.createElement(CheckEmailsResult, { state: { phase: "done", result: ok() } }));
    expect(html).toContain("Finished — partial");
    expect(html).toContain("2<!-- --> new filed");
    expect(html).toContain("canericaextreme@gmail.com");
    expect(html).toContain("limit reached");
    expect(html).toContain("access refused");
  });
});
