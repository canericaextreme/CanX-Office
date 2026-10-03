import type { ReceiptSyncResult } from "./receipt-ingestion.functions";
import { HISTORICAL_SCAN_STEPS_PER_START } from "./gmail-scan-window";

export const CHECK_EMAILS_NOW_REQUEST = "Check receipts and subscriptions";
export const HISTORICAL_EMAIL_SCAN_REQUEST = "Check receipts and subscriptions from selected date";

export type CheckState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; result: ReceiptSyncResult }
  | { phase: "failed"; message: string; code: string };

/**
 * Button controller: one run at a time, same server workflow as Elsie's command,
 * refresh only after a verified (ok) result. Pure so it can be regression-tested.
 */
export function createCheckEmailsController(deps: {
  run: (request: string, fromDate?: string) => Promise<ReceiptSyncResult>;
  onState: (s: CheckState) => void;
  onVerified: () => void;
}) {
  let inFlight = false;
  return {
    get running() { return inFlight; },
    async start(fromDate?: string, historical = false): Promise<boolean> {
      if (inFlight) return false;
      inFlight = true;
      deps.onState({ phase: "running" });
      try {
        const request = historical ? HISTORICAL_EMAIL_SCAN_REQUEST : CHECK_EMAILS_NOW_REQUEST;
        let result = await deps.run(request, fromDate);
        let steps = 1;
        while (historical && result.ok && result.hasMore && result.canContinueNow && steps < HISTORICAL_SCAN_STEPS_PER_START) {
          const next = await deps.run(request, fromDate);
          result = {
            ...next,
            filed: result.filed + next.filed,
            duplicatesSkipped: result.duplicatesSkipped + next.duplicatesSkipped,
            needsReview: result.needsReview + next.needsReview,
            subscriptionEvidenceAdded: (result.subscriptionEvidenceAdded ?? 0) + (next.subscriptionEvidenceAdded ?? 0),
            subscriptionEvidenceDuplicates: (result.subscriptionEvidenceDuplicates ?? 0) + (next.subscriptionEvidenceDuplicates ?? 0),
            sentToReview: (result.sentToReview ?? 0) + (next.sentToReview ?? 0),
            ignoredByPreference: (result.ignoredByPreference ?? 0) + (next.ignoredByPreference ?? 0),
          };
          steps += 1;
        }
        if (result.ok) {
          deps.onState({ phase: "done", result });
          deps.onVerified();
        } else {
          deps.onState({ phase: "failed", message: result.message, code: result.code });
        }
      } catch {
        deps.onState({ phase: "failed", message: "The check did not return a result. Nothing is reported as filed.", code: "no_result" });
      } finally {
        inFlight = false;
      }
      return true;
    },
  };
}
