import { describe, expect, it, vi } from "vitest";
import { classifyFinanceRead, financeReadMessage } from "./finance-read-diagnosis";
import { runReceiptSyncWith, type SyncDeps } from "./receipt-ingestion.functions";

describe("Finance read diagnosis (real PostgREST bodies)", () => {
  it("classifies the observed live failure: migration 0004 columns missing", () => {
    // Exact body returned by the CanX database on 3 Oct 2026.
    const body = { code: "42703", message: "column finance_receipts.gmail_sync_checkpoint does not exist" };
    expect(classifyFinanceRead(400, body)).toBe("ingestion_setup_missing");
  });
  it("separates config, session, RLS, missing table and unexpected", () => {
    expect(classifyFinanceRead(null, null)).toBe("backend_not_configured");
    expect(classifyFinanceRead(401, { code: "PGRST303" })).toBe("session_expired");
    expect(classifyFinanceRead(401, { code: "42501" })).toBe("access_denied");
    expect(classifyFinanceRead(404, { code: "PGRST205" })).toBe("table_missing");
    expect(classifyFinanceRead(500, "oops")).toBe("unexpected_response");
  });
  it("messages are safe and never echo provider text", () => {
    const m = financeReadMessage("ingestion_setup_missing");
    expect(m).toContain("migration 0004");
    expect(m).toContain("Gmail was not contacted");
    expect(m).not.toContain("gmail_sync_checkpoint");
  });
  it("runner stays fail-closed and surfaces the classified reason", async () => {
    const fetchCandidates = vi.fn();
    const atomicWrite = vi.fn();
    const deps = {
      verifyOwner: async () => ({ ok: true, userId: "o", email: "", aal: "aal2" }),
      gmailAccounts: () => [{ lovableApiKey: "x", connectionApiKey: "y" }],
      readState: async () => ({ ok: false, checkpoint: null, receipts: [], failure: "ingestion_setup_missing" as const }),
      fetchCandidates, atomicWrite,
    } as unknown as SyncDeps;
    const r = await runReceiptSyncWith(deps, { accessToken: "t", request: "review receipts" });
    expect(r.code).toBe("database_unavailable");
    expect(JSON.stringify(r)).toContain("ingestion_setup_missing");
    expect(fetchCandidates).not.toHaveBeenCalled();
    expect(atomicWrite).not.toHaveBeenCalled();
  });
});
