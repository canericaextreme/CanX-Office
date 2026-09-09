/**
 * Private finance receipts in the CanX-owned database.
 *
 * Every call re-verifies the owner on the server (valid session, owner role,
 * two-step verification). While no CanX-owned database is configured, every
 * call denies and the Finance room stays in clearly-labelled device-only mode.
 * Receipts are private: they are never public, never anonymous, and never
 * shipped inside the app.
 */

import { createServerFn } from "@tanstack/react-start";
import type { OwnerDenyReason } from "@/lib/canx-backend.server";
import { parseReceiptImport, toExportDocument, type FinanceReceipt } from "@/lib/finance-receipts";

export interface FinanceResult<T> {
  ok: boolean;
  reason: OwnerDenyReason | "backend_error" | "invalid_data" | null;
  message: string;
  data: T | null;
}

function fail<T>(reason: NonNullable<FinanceResult<T>["reason"]>, message: string): FinanceResult<T> {
  return { ok: false, reason, message, data: null };
}

const tokenOf = (input: unknown) => {
  const raw = input as { accessToken?: unknown } | undefined;
  return typeof raw?.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "";
};

async function withOwner<T>(
  accessToken: string,
  run: (ctx: {
    config: NonNullable<ReturnType<typeof import("@/lib/canx-backend.server").readBackendConfig>>;
    userId: string;
    token: string;
    rest: typeof import("@/lib/canx-backend.server").restRequest;
  }) => Promise<FinanceResult<T>>,
): Promise<FinanceResult<T>> {
  const backend = await import("@/lib/canx-backend.server");
  const config = backend.readBackendConfig();
  if (!config) return fail("backend_not_configured", backend.DENY_MESSAGES.backend_not_configured);
  const verified = await backend.verifyOwner(accessToken);
  if (!verified.ok) return fail(verified.reason, verified.message);
  return run({ config, userId: verified.userId, token: accessToken, rest: backend.restRequest });
}

/** Reads the owner's private receipts. */
export const listPrivateReceipts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ({ accessToken: tokenOf(input) }))
  .handler(async ({ data }): Promise<FinanceResult<string>> =>
    withOwner<string>(data.accessToken, async ({ config, token, rest }) => {
      const response = await rest(config, token, "finance_receipts?select=doc&order=created_at.desc&limit=1");
      if (!response.ok) return fail("backend_error", "The private receipts could not be read.");
      const rows = Array.isArray(response.body) ? (response.body as Array<{ doc?: unknown }>) : [];
      const doc = rows[0]?.doc ?? null;
      return { ok: true, reason: null, message: "", data: doc ? JSON.stringify(doc) : "" };
    }),
  );

/**
 * Saves the owner's private receipts. The document is validated on the server
 * before anything is written, so a malformed payload cannot replace good
 * records with rubbish.
 */
export const savePrivateReceipts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = input as { doc?: unknown } | undefined;
    return {
      accessToken: tokenOf(input),
      doc: typeof raw?.doc === "string" ? raw.doc.slice(0, 8_000_000) : "",
    };
  })
  .handler(async ({ data }): Promise<FinanceResult<{ saved: number }>> =>
    withOwner<{ saved: number }>(data.accessToken, async ({ config, token, userId, rest }) => {
      const parsed = parseReceiptImport(data.doc);
      if (!parsed.ok) {
        return fail("invalid_data", "The receipts were not in the expected shape, so nothing was changed.");
      }
      const receipts: FinanceReceipt[] = parsed.receipts;
      const response = await rest(config, token, "finance_receipts?on_conflict=owner_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([
          { owner_id: userId, doc: toExportDocument(receipts), updated_at: new Date().toISOString() },
        ]),
      });
      if (!response.ok) return fail("backend_error", "The private receipts could not be saved.");
      await rest(config, token, "office_audit", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        // The audit keeps counts only. No vendor, amount, or email text.
        body: JSON.stringify({
          owner_id: userId,
          action: "finance.receipts.save",
          entity: "finance_receipts",
          detail: { count: receipts.length },
        }),
      });
      return { ok: true, reason: null, message: "Saved to the CanX account.", data: { saved: receipts.length } };
    }),
  );
