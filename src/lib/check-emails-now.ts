import type { ReceiptSyncResult } from "./receipt-ingestion.functions";

export const CHECK_EMAILS_NOW_REQUEST = "Check receipts and subscriptions";

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
  run: (request: string) => Promise<ReceiptSyncResult>;
  onState: (s: CheckState) => void;
  onVerified: () => void;
}) {
  let inFlight = false;
  return {
    get running() { return inFlight; },
    async start(): Promise<boolean> {
      if (inFlight) return false;
      inFlight = true;
      deps.onState({ phase: "running" });
      try {
        const result = await deps.run(CHECK_EMAILS_NOW_REQUEST);
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
