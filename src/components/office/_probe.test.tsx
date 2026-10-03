import { it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { CheckEmailsResult } from "./CheckEmailsNow";
import { WeeklySubscriptionCards } from "./WeeklySubscriptionCards";
import { STARTER_SUBSCRIPTIONS, weeklyView, cleanLastCheck } from "@/lib/subscriptions";
it("probe", () => {
  const result: any = { ok: true, code: "ok", message: "m", filed: 0, duplicatesSkipped: 0, needsReview: 0, receipts: [], totalsByCurrency: [], partial: true, mailboxesChecked: 2, mailboxesFailed: 0, subscriptionEvidenceAdded: 0, subscriptionEvidenceDuplicates: 0, sentToReview: 0, notFiledPersonal: 0, mailboxes: [{ mailbox: "a@gmail.com", status: "read", partial: true, documents: 3 }] };
  console.log(renderToString(<CheckEmailsResult state={{ phase: "done", result }} />).length);
  const lc = cleanLastCheck({ at: new Date().toISOString(), scope: "s", complete: false, mailboxes: result.mailboxes });
  console.log(renderToString(<WeeklySubscriptionCards view={weeklyView(STARTER_SUBSCRIPTIONS, [])} lastCheck={lc} />).length);
});
