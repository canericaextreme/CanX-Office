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
import { mergeReceipts, parseReceiptImport, toExportDocument, type FinanceReceipt } from "@/lib/finance-receipts";

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
      const response = await rest(config, token, "finance_receipts?select=doc,ingested_receipts&order=created_at.desc&limit=1");
      if (!response.ok) return fail("backend_error", "The private receipts could not be read.");
      const rows = Array.isArray(response.body) ? (response.body as Array<{ doc?: unknown; ingested_receipts?: unknown }>) : [];
      const doc = rows[0]?.doc ?? null;
      if (!doc && !Array.isArray(rows[0]?.ingested_receipts)) return { ok: true, reason: null, message: "", data: "" };
      const parsed = doc ? parseReceiptImport(JSON.stringify(doc)) : { ok: false, receipts: [] as FinanceReceipt[] };
      const ingestedDoc = JSON.stringify(toExportDocument(Array.isArray(rows[0]?.ingested_receipts) ? rows[0].ingested_receipts as FinanceReceipt[] : []));
      const ingested = parseReceiptImport(ingestedDoc);
      const merged = mergeReceipts(parsed.ok ? parsed.receipts : [], ingested.ok ? ingested.receipts : []).merged;
      return { ok: true, reason: null, message: "", data: JSON.stringify(toExportDocument(merged)) };
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
      // Compare-and-swap: receipts come from this save; every other key
      // (subscriptions, evidence, last check, future keys) is taken from the
      // LATEST stored doc on each attempt, so a concurrent save is never lost.
      const { casUpdateFinanceDoc, sameContent } = await import("@/lib/finance-doc-cas.server");
      const exported = toExportDocument(receipts) as unknown as Record<string, unknown>;
      const result = await casUpdateFinanceDoc({
        rest: rest as never,
        config,
        token,
        ownerId: userId,
        mutate: (latest) => ({ ...latest, ...exported }),
        verify: (written) => sameContent(written["receipts"], exported["receipts"]),
      });
      if (!result.ok) {
        return fail(
          "backend_error",
          result.reason === "conflict"
            ? "Another save changed Finance at the same moment and kept winning, so these receipts were NOT saved. Reload and try again."
            : "The private receipts could not be saved and verified.",
        );
      }
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
