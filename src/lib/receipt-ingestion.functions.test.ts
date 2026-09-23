import { describe, expect, it, vi } from "vitest";
import { runReceiptSyncWith, isExplicitReceiptSyncRequest, type SyncDeps } from "./receipt-ingestion.functions";
import type { OwnerVerification } from "./canx-backend.server";

const owner: OwnerVerification = { ok: true, userId: "owner", email: "", aal: "aal2" };
const settings = { lovableApiKey: "x", connectionApiKey: "y" };
const base = (): {
  [K in keyof SyncDeps]: ReturnType<typeof vi.fn<SyncDeps[K]>>;
} => ({
  verifyOwner: vi.fn(async () => owner),
  gmailSettings: vi.fn(() => settings),
  readState: vi.fn(async () => ({ ok: true, checkpoint: null, receipts: [] })),
  fetchCandidates: vi.fn(async () => ({ documents: [], checkpoint: "now", unsupported: 0 })),
  atomicWrite: vi.fn(async () => ({ ok: true, filed: [], duplicates: 0, allReceipts: [] })),
});

describe("owner-only Gmail receipt sync", () => {
  it("requires explicit receipt sync intent", async () => {
    const deps = base();
    expect(isExplicitReceiptSyncRequest("review receipts")).toBe(true);
    expect(isExplicitReceiptSyncRequest("tell me about finance")).toBe(false);
    expect(isExplicitReceiptSyncRequest("Astra, please retrieve my receipts")).toBe(true);
    expect(isExplicitReceiptSyncRequest("Do not retrieve receipts")).toBe(false);
    expect(isExplicitReceiptSyncRequest("Repair conversation memory.\nReview receipts and report blockers.")).toBe(false);
    expect(isExplicitReceiptSyncRequest("Review receipts. " + "Also repair conversation memory. ".repeat(12))).toBe(false);
    const result = await runReceiptSyncWith(deps, { accessToken: "t", request: "hello" });
    expect(result.code).toBe("invalid_request");
    expect(deps.fetchCandidates).not.toHaveBeenCalled();
    expect(deps.atomicWrite).not.toHaveBeenCalled();
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
    deps.gmailSettings.mockReturnValue(null);
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
    expect(deps.fetchCandidates).toHaveBeenCalledWith(settings, "yesterday", false);
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
    expect(deps.fetchCandidates).toHaveBeenCalledWith(settings, null, true);
    expect(result.code).toBe("gmail_authorization_required");
    expect(deps.atomicWrite).not.toHaveBeenCalled();
  });
});
