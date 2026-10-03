import { describe, expect, it, vi } from "vitest";
import { runReceiptSyncWith, isExplicitReceiptSyncRequest, receiptSyncOutcome, type ReceiptSyncResult, type SyncDeps } from "./receipt-ingestion.functions";
import type { OwnerVerification } from "./canx-backend.server";

const owner: OwnerVerification = { ok: true, userId: "owner", email: "", aal: "aal2" };
const settings = { lovableApiKey: "x", connectionApiKey: "y" };
const base = (): {
  [K in keyof Omit<SyncDeps, "writeEvidence">]: ReturnType<typeof vi.fn<Required<SyncDeps>[K]>>;
} => ({
  verifyOwner: vi.fn(async () => owner),
  gmailAccounts: vi.fn(() => [settings]),
  readState: vi.fn(async () => ({ ok: true, checkpoint: null, receipts: [] })),
  fetchCandidates: vi.fn(async () => ({ documents: [], checkpoint: "now", unsupported: 0 })),
  atomicWrite: vi.fn(async () => ({ ok: true, filed: [], duplicates: 0, allReceipts: [] })),
});

describe("owner-only Gmail receipt sync", () => {
  it("requires explicit receipt sync intent", async () => {
    const deps = base();
    expect(isExplicitReceiptSyncRequest("review receipts")).toBe(true);
    expect(isExplicitReceiptSyncRequest("tell me about finance")).toBe(false);
    expect(isExplicitReceiptSyncRequest("Elsie, please retrieve my receipts")).toBe(true);
    expect(isExplicitReceiptSyncRequest("Astra, please retrieve my receipts")).toBe(true);
    expect(isExplicitReceiptSyncRequest("Do not retrieve receipts")).toBe(false);
    expect(isExplicitReceiptSyncRequest("Repair conversation memory.\nReview receipts and report blockers.")).toBe(false);
    expect(isExplicitReceiptSyncRequest("Review receipts. " + "Also repair conversation memory. ".repeat(12))).toBe(false);
    const result = await runReceiptSyncWith(deps, { accessToken: "t", request: "hello" });
    expect(result.code).toBe("invalid_request");
    expect(deps.fetchCandidates).not.toHaveBeenCalled();
    expect(deps.atomicWrite).not.toHaveBeenCalled();
  });

  it("accepts only dedicated normal email-check commands, not status, negation, hypotheticals or discussion", () => {
    for (const command of ["check my email", "check the emails", "check both mailboxes", "can you check my email", "Elsie, please check both mailboxes?"]) {
      expect(isExplicitReceiptSyncRequest(command), command).toBe(true);
    }
    for (const command of ["Have you checked email?", "Do not check my email", "If I asked you to check my email, what would happen?", "Explain how you check the emails", "Can you check my email and then publish the report?"]) {
      expect(isExplicitReceiptSyncRequest(command), command).toBe(false);
    }
  });

  it("describes the bounded scope, stopped state and every returned mailbox honestly", () => {
    const failed: ReceiptSyncResult = { ok: false, code: "gmail_unavailable", message: "Nothing was filed.", filed: 0, duplicatesSkipped: 0, needsReview: 0, receipts: [], totalsByCurrency: [], partial: true, mailboxesFailed: 2, mailboxesChecked: 0, mailboxes: [
      { mailbox: "Mailbox one", status: "failed", partial: true, documents: 0 },
      { mailbox: "Mailbox two", status: "authorization_required", partial: true, documents: 0 },
    ] };
    const text = receiptSyncOutcome(failed);
    expect(text).toContain("Stopped — the check failed");
    expect(text).toContain("not the whole inbox");
    expect(text).toContain("Mailbox one: could not be read");
    expect(text).toContain("Mailbox two: access refused");
  });

  it("fails before Gmail or writes when owner/AAL2 fails", async () => {
    const deps = base();
    deps.verifyOwner.mockResolvedValue({ ok: false, reason: "mfa_required", message: "MFA required" });
    const result = await runReceiptSyncWith(deps, { accessToken: "t", request: "review receipts" });
    expect(result.code).toBe("auth_not_ready");
    expect(deps.fetchCandidates).not.toHaveBeenCalled();
    expect(deps.atomicWrite).not.toHaveBeenCalled();
  });

  it("fails closed when the CanX connector is absent and never contacts Gmail or Finance", async () => {
    const deps = base();
    deps.gmailAccounts.mockReturnValue([]);
    const result = await runReceiptSyncWith(deps, { accessToken: "t", request: "retrieve receipts" });
    expect(result.code).toBe("gmail_authorization_required");
    expect(deps.readState).not.toHaveBeenCalled();
    expect(deps.fetchCandidates).not.toHaveBeenCalled();
    expect(deps.atomicWrite).not.toHaveBeenCalled();
  });

  it("does not contact Gmail when Finance prerequisites fail", async () => {
    const deps = base();
    deps.readState.mockResolvedValue({ ok: false, checkpoint: null, receipts: [] });
    const result = await runReceiptSyncWith(deps, { accessToken: "t", request: "check invoices" });
    expect(result.code).toBe("database_unavailable");
    expect(deps.fetchCandidates).not.toHaveBeenCalled();
    expect(deps.atomicWrite).not.toHaveBeenCalled();
  });

  it("uses checkpoints and reports partial malformed candidates", async () => {
    const deps = base();
    deps.readState.mockResolvedValue({ ok: true, checkpoint: "yesterday", receipts: [] });
    deps.fetchCandidates.mockResolvedValue({
      documents: [{ messageId: "m", attachmentIdentity: "a", filename: "x.pdf", mimeType: "application/pdf", text: "Vendor: A Invoice # A Total: CAD 10 Currency: CAD" }],
      checkpoint: "today",
      unsupported: 2,
    });
    deps.atomicWrite.mockImplementation(async (_token, _owner, receipts) => ({ ok: true, filed: receipts, duplicates: 0, allReceipts: receipts }));
    const result = await runReceiptSyncWith(deps, { accessToken: "t", request: "review receipts" });
    expect(deps.fetchCandidates).toHaveBeenCalledWith(settings, "yesterday", false, expect.any(String), expect.anything(), null);
    expect(result.ok).toBe(true);
    expect(result.filed).toBe(1);
    expect(result.needsReview).toBe(3);
  });

  it("never reports a write that cannot be verified", async () => {
    const deps = base();
    deps.atomicWrite.mockResolvedValue({ ok: false, filed: [], duplicates: 0, allReceipts: [] });
    const result = await runReceiptSyncWith(deps, { accessToken: "t", request: "sync invoices" });
    expect(result.code).toBe("write_unverified");
    expect(result.filed).toBe(0);
  });

  it("passes explicit rescan and surfaces connector authorization errors safely", async () => {
    const deps = base();
    deps.fetchCandidates.mockRejectedValue(new Error("gmail_authorization_required"));
    const result = await runReceiptSyncWith(deps, { accessToken: "t", request: "rescan and review receipts" });
    expect(deps.fetchCandidates).toHaveBeenCalledWith(settings, null, true, expect.any(String), expect.anything(), null);
    expect(result.code).toBe("gmail_authorization_required");
    expect(deps.atomicWrite).not.toHaveBeenCalled();
  });

  it("checks every linked mailbox and files from the ones that respond", async () => {
    const deps = base();
    const second = { lovableApiKey: "x", connectionApiKey: "z" };
    deps.gmailAccounts.mockReturnValue([settings, second]);
    deps.fetchCandidates
      .mockRejectedValueOnce(new Error("gmail_unavailable"))
      .mockResolvedValueOnce({
        documents: [{ messageId: "m2", attachmentIdentity: "a", filename: "x.pdf", mimeType: "application/pdf", text: "Vendor: B Total: CAD 20 Currency: CAD", mailbox: "canerica14@gmail.com" }],
        checkpoint: "now",
        unsupported: 0,
      });
    deps.atomicWrite.mockImplementation(async (_token, _owner, receipts) => ({ ok: true, filed: receipts, duplicates: 0, allReceipts: receipts }));
    const result = await runReceiptSyncWith(deps, { accessToken: "t", request: "review receipts" });
    expect(deps.fetchCandidates).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.filed).toBe(1);
    expect(result.message).toContain("1 linked mailbox could not be read");
  });

  it("fails honestly when every linked mailbox fails", async () => {
    const deps = base();
    deps.gmailAccounts.mockReturnValue([settings, { lovableApiKey: "x", connectionApiKey: "z" }]);
    deps.fetchCandidates.mockRejectedValue(new Error("gmail_unavailable"));
    const result = await runReceiptSyncWith(deps, { accessToken: "t", request: "review receipts" });
    expect(result.code).toBe("gmail_unavailable");
    expect(deps.atomicWrite).not.toHaveBeenCalled();
  });

  it("keeps the source mailbox on each filed receipt", async () => {
    const deps = base();
    deps.fetchCandidates.mockResolvedValue({
      documents: [{ messageId: "m", attachmentIdentity: "a", filename: "x.pdf", mimeType: "application/pdf", text: "Vendor: A Total: CAD 10 Currency: CAD", mailbox: "canericaextreme@gmail.com" }],
      checkpoint: "now",
      unsupported: 0,
    });
    deps.atomicWrite.mockImplementation(async (_token, _owner, receipts) => ({ ok: true, filed: receipts, duplicates: 0, allReceipts: receipts }));
    const result = await runReceiptSyncWith(deps, { accessToken: "t", request: "review receipts" });
    expect(result.ok).toBe(true);
    const filed = deps.atomicWrite.mock.calls[0]?.[2] as Array<{ gmailMailbox?: string }>;
    expect(filed[0]?.gmailMailbox).toBe("canericaextreme@gmail.com");
  });
  it("searches full history for every mailbox when more than one is linked", async () => {
    const deps = base();
    const second = { lovableApiKey: "x", connectionApiKey: "z" };
    deps.gmailAccounts.mockReturnValue([settings, second]);
    deps.readState.mockResolvedValue({ ok: true, checkpoint: "yesterday", receipts: [] });
    await runReceiptSyncWith(deps, { accessToken: "t", request: "review receipts" });
    expect(deps.fetchCandidates).toHaveBeenNthCalledWith(1, settings, null, false, expect.any(String), expect.anything(), null);
    expect(deps.fetchCandidates).toHaveBeenNthCalledWith(2, second, null, false, expect.any(String), expect.anything(), null);
  });

  it("keeps the old checkpoint after a partial failure so a retry misses nothing", async () => {
    const deps = base();
    const second = { lovableApiKey: "x", connectionApiKey: "z" };
    deps.gmailAccounts.mockReturnValue([settings, second]);
    deps.readState.mockResolvedValue({ ok: true, checkpoint: "yesterday", receipts: [] });
    deps.fetchCandidates
      .mockResolvedValueOnce({ documents: [], checkpoint: "today", unsupported: 0 })
      .mockRejectedValueOnce(new Error("gmail_unavailable"));
    await runReceiptSyncWith(deps, { accessToken: "t", request: "review receipts" });
    expect(deps.atomicWrite.mock.calls[0]?.[3]).toBe("yesterday");
    deps.fetchCandidates.mockReset().mockResolvedValue({ documents: [], checkpoint: "later", unsupported: 0 });
    await runReceiptSyncWith(deps, { accessToken: "t", request: "review receipts" });
    expect(deps.fetchCandidates).toHaveBeenNthCalledWith(2, second, null, false, expect.any(String), expect.anything(), null);
  });

  it("keeps candidates from every mailbox instead of truncating to the first", async () => {
    const deps = base();
    const second = { lovableApiKey: "x", connectionApiKey: "z" };
    deps.gmailAccounts.mockReturnValue([settings, second]);
    const doc = (id: string, mailbox: string) => ({ messageId: id, attachmentIdentity: "a", filename: "x.pdf", mimeType: "application/pdf", text: `Vendor: ${id} Total: CAD 20 Currency: CAD`, mailbox });
    deps.fetchCandidates
      .mockResolvedValueOnce({ documents: Array.from({ length: 25 }, (_, n) => doc(`e${n}`, "canericaextreme@gmail.com")), checkpoint: "now", unsupported: 0 })
      .mockResolvedValueOnce({ documents: [doc("c1", "canerica14@gmail.com")], checkpoint: "now", unsupported: 0 });
    deps.atomicWrite.mockImplementation(async (_t, _o, receipts) => ({ ok: true, filed: receipts, duplicates: 0, allReceipts: receipts }));
    await runReceiptSyncWith(deps, { accessToken: "t", request: "review receipts" });
    const filed = deps.atomicWrite.mock.calls[0]?.[2] ?? [];
    expect(filed.some((r) => r.gmailMailbox === "canerica14@gmail.com")).toBe(true);
  });

  it("rekeys a changed dated scan and resumes only the matching frozen window", async () => {
    const deps = base();
    const saveScanProgress = vi.fn(async () => true);
    deps.saveScanProgress = saveScanProgress;
    deps.readState.mockResolvedValue({
      ok: true, checkpoint: "cp", receipts: [],
      continuation: { "a@gmail.com": { token: "OLD", query: "dated|old", savedAt: "" } },
      scanConfig: { fromDate: "2026-08-15", endAt: "2026-10-03T20:00:00.000Z", status: "paused", savedAt: "", queryKey: "dated|old", completedSlots: [], mailboxes: [] },
    });
    deps.fetchCandidates.mockResolvedValue({ documents: [], checkpoint: "now", unsupported: 0, mailbox: "a@gmail.com" });
    const changed = await runReceiptSyncWith(deps, { accessToken: "t", request: "check receipts", fromDate: "2026-08-16" });
    expect((deps.fetchCandidates as ReturnType<typeof vi.fn>).mock.calls[0]?.[4]).toEqual({});
    expect(changed.endAt).not.toBe("2026-10-03T20:00:00.000Z");
    expect(saveScanProgress).toHaveBeenCalled();
  });

  it("preserves a verified mailbox cursor and stops without advancing an incomplete page", async () => {
    const deps = base();
    const saveScanProgress = vi.fn(async () => true);
    deps.saveScanProgress = saveScanProgress;
    deps.fetchCandidates.mockResolvedValue({ documents: [], checkpoint: "now", unsupported: 1, mailbox: "a@gmail.com", partial: true, nextPageToken: "NEXT", fetchFailures: 1 });
    const result = await runReceiptSyncWith(deps, { accessToken: "t", request: "check receipts", fromDate: "2026-08-15" });
    expect(result.hasMore).toBe(true);
    expect(result.canContinueNow).toBe(false);
    expect((saveScanProgress.mock.calls as unknown[][])[0]?.[2]).toEqual({});
  });

  it("does not fetch a later mailbox after an incomplete fetch page", async () => {
    const deps = base();
    deps.gmailAccounts = () => [settings, { lovableApiKey: "b", connectionApiKey: "c" }];
    deps.saveScanProgress = vi.fn(async () => true);
    deps.fetchCandidates.mockResolvedValue({ documents: [], checkpoint: "now", unsupported: 0, mailbox: "a@gmail.com", partial: true, fetchFailures: 1 });
    const result = await runReceiptSyncWith(deps, { accessToken: "t", request: "check receipts", fromDate: "2026-08-15" });
    expect(deps.fetchCandidates).toHaveBeenCalledTimes(1);
    expect(result.mailboxesFailed).toBe(1);
    expect(result.canContinueNow).toBe(false);
  });
});
