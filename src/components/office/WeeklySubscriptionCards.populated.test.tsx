import { it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { CheckEmailsResult } from "./CheckEmailsNow";
import { WeeklySubscriptionCards } from "./WeeklySubscriptionCards";
import { STARTER_SUBSCRIPTIONS, weeklyView, cleanLastCheck, formatZoned, type SubscriptionEvidence } from "@/lib/subscriptions";

// Shape of the 2026-10-03 19:35:48 UTC run: 0 filed, 0 duplicates, last-check saved.
const result: any = {
  ok: true, code: "ok", message: "Receipt review finished", filed: 0, duplicatesSkipped: 0, needsReview: 0,
  receipts: [], totalsByCurrency: [], partial: true, mailboxesChecked: 2, mailboxesFailed: 0,
  subscriptionEvidenceAdded: 0, subscriptionEvidenceDuplicates: 0, sentToReview: 0, notFiledPersonal: 0,
  mailboxes: [
    { mailbox: "canericaextreme@gmail.com", status: "read", partial: true, documents: 25 },
    { mailbox: "canerica14@gmail.com", status: "read", partial: false, documents: 4 },
  ],
};

it("formatZoned never throws for a real instant (Intl option conflict regression)", () => {
  expect(formatZoned("2026-10-03T19:35:48.000Z")).toMatch(/2026/);
  expect(formatZoned("not a date")).toBe("unknown time");
});

it("Subscriptions renders after a completed check with a saved last-check time", () => {
  const lastCheck = cleanLastCheck({ at: "2026-10-03T19:35:48.000Z", scope: "past year", complete: false, mailboxes: result.mailboxes });
  const ev = { id: "ev-1", kind: "renewal-notice", matchStatus: "unverified-sender", subscriptionId: null, candidateIds: [], vendor: "Sintra", amount: 20, currency: "USD", documentDate: "2026-10-02", renewalDate: "", renewalBasis: "", mailbox: "canerica14@gmail.com", messageId: "18f0a1b2c3d4", attachmentIdentity: "", from: "", subject: "", fingerprint: "f", receivedAt: new Date().toISOString(), recordedAt: new Date().toISOString(), review: "needs-review" } as SubscriptionEvidence;
  const html = renderToString(<>
    <CheckEmailsResult state={{ phase: "done", result }} />
    <WeeklySubscriptionCards view={weeklyView(STARTER_SUBSCRIPTIONS, [ev])} lastCheck={lastCheck} />
  </>);
  expect(html).toContain("Last checked");
  expect(html).toContain("canerica14@gmail.com");
});
