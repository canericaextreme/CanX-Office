/**
 * Live office context for the Office Manager — SERVER ONLY, FAIL CLOSED.
 *
 * This module is the only source of office facts sent to the AI provider. It
 * runs after the server has verified the signed-in owner and two-step
 * verification, and it reads records through the owner's own token so RLS
 * applies exactly as it does everywhere else.
 *
 * Privacy rules that must not be relaxed:
 *  - Receipts are reduced to counts and per-currency totals inside this module.
 *    Vendor names, per-receipt amounts, order numbers, email text, links and
 *    message ids never leave it, and the raw receipt document is never returned.
 *  - Nothing is invented. Where there is no authoritative table, the context
 *    says none are recorded rather than falling back to demonstration data.
 *  - Any required read that fails makes the whole context fail, so the manager
 *    refuses instead of answering from stale or sample facts.
 */

import { parseReceiptImport } from "@/lib/finance-receipts";
import type { BackendConfig } from "@/lib/canx-backend.server";

export type RestImpl = (
  config: BackendConfig,
  accessToken: string,
  path: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; body: unknown }>;

export interface LiveContextRequest {
  config: BackendConfig;
  token: string;
  ownerEmail: string;
  aal: string;
  provider: string;
  model: string;
  rest: RestImpl;
}

export type LiveContextResult = { ok: true; text: string } | { ok: false; message: string };

export interface ReceiptSummary {
  receipts: number;
  sourceMessages: number;
  needsReview: number;
  reconciled: number;
  /** Totals never cross currencies. "unspecified" is a first-class case. */
  totalsByCurrency: { currency: string; total: number; count: number }[];
}

/** Counts and per-currency totals only. No text from any receipt is kept. */
export function summariseReceiptDocument(docJson: string | null): ReceiptSummary {
  const empty: ReceiptSummary = { receipts: 0, sourceMessages: 0, needsReview: 0, reconciled: 0, totalsByCurrency: [] };
  if (!docJson) return empty;
  const parsed = parseReceiptImport(docJson);
  if (!parsed.ok) return empty;

  const totals = new Map<string, { total: number; count: number }>();
  let sourceMessages = 0;
  let needsReview = 0;
  let reconciled = 0;

  for (const receipt of parsed.receipts) {
    sourceMessages += Math.max(receipt.sourceMessageIds.length, receipt.duplicateCount || 0, 1);
    if (receipt.reviewStatus === "needs-review") needsReview += 1;
    if (receipt.paymentStatus === "reconciled") reconciled += 1;
    const currency = (receipt.currency ?? "").trim().toUpperCase() || "unspecified";
    const bucket = totals.get(currency) ?? { total: 0, count: 0 };
    bucket.total += typeof receipt.total === "number" ? receipt.total : 0;
    bucket.count += 1;
    totals.set(currency, bucket);
  }

  return {
    receipts: parsed.receipts.length,
    sourceMessages,
    needsReview,
    reconciled,
    totalsByCurrency: [...totals.entries()]
      .map(([currency, value]) => ({ currency, total: Math.round(value.total * 100) / 100, count: value.count }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}

const line = (value: unknown, max = 300) => (typeof value === "string" ? value.replace(/\s+/g, " ").slice(0, max) : "");

/**
 * Builds the office context from live, owner-scoped records.
 * Every read must succeed; otherwise the result is a plain failure.
 */
export async function buildLiveOfficeContext(request: LiveContextRequest): Promise<LiveContextResult> {
  const { config, token, rest } = request;

  const notesResponse = await rest(config, token, "office_notes?select=*&order=created_at.desc&limit=200").catch(
    () => null,
  );
  if (!notesResponse?.ok) {
    return { ok: false, message: "The office records could not be read just now, so no answer was requested." };
  }

  const roundTableResponse = await rest(
    config,
    token,
    "round_tables?select=key,updated_at&order=updated_at.desc&limit=5",
  ).catch(() => null);
  if (!roundTableResponse?.ok) {
    return { ok: false, message: "The meeting records could not be read just now, so no answer was requested." };
  }

  const receiptsResponse = await rest(
    config,
    token,
    "finance_receipts?select=doc&order=created_at.desc&limit=1",
  ).catch(() => null);
  if (!receiptsResponse?.ok) {
    return { ok: false, message: "The finance records could not be read just now, so no answer was requested." };
  }

  const noteRows = Array.isArray(notesResponse.body) ? (notesResponse.body as Record<string, unknown>[]) : [];
  const notes = noteRows
    .map((row) => {
      const title = line(row["title"]);
      if (!title) return null;
      const kind = row["kind"] === "decision" ? "decision" : "task";
      const provenance = line(row["provenance"], 20) === "sample" ? "sample" : "saved by John";
      const detail = line(row["detail"], 400);
      return `- (${kind}, ${provenance}) ${title}${detail ? ` — ${detail}` : ""}`;
    })
    .filter((value): value is string => value !== null);

  const tableRows = Array.isArray(roundTableResponse.body) ? (roundTableResponse.body as Record<string, unknown>[]) : [];
  const roundTables = tableRows.map((row) => {
    const key = line(row["key"], 80) || "(unnamed)";
    const updated = line(row["updated_at"], 40);
    return `- ${key}${updated ? ` — last updated ${updated}` : " — last update time not recorded"}`;
  });

  const receiptRows = Array.isArray(receiptsResponse.body) ? (receiptsResponse.body as Array<{ doc?: unknown }>) : [];
  const doc = receiptRows[0]?.doc ?? null;
  const finance = summariseReceiptDocument(doc ? JSON.stringify(doc) : null);

  const totals = finance.totalsByCurrency.length
    ? finance.totalsByCurrency.map((t) => `${t.currency}: ${t.total.toFixed(2)} across ${t.count} receipts`).join("; ")
    : "none recorded";

  const text = [
    "CanX Office live context. Every fact below was read from the CanX-owned database just now, as the signed-in owner.",
    [
      "Verified connection state [provenance: server-verified]:",
      "- CanX-owned database: connected and answering.",
      `- Owner sign-in: confirmed for ${request.ownerEmail || "the owner account"}.`,
      `- Two-step verification: confirmed (${request.aal}).`,
      `- Office Manager provider: ${request.provider}; model: ${request.model}.`,
    ].join("\n"),
    notes.length
      ? `Shared office notes, tasks and decisions [provenance: live database]:\n${notes.join("\n")}`
      : "Shared office notes, tasks and decisions [provenance: live database]: none recorded.",
    roundTables.length
      ? `Round table records [provenance: live database]:\n${roundTables.join("\n")}`
      : "Round table records [provenance: live database]: none recorded.",
    [
      "Finance receipt filing summary [provenance: live database, aggregate only]:",
      `- Receipts filed: ${finance.receipts}`,
      `- Source messages behind them: ${finance.sourceMessages}`,
      `- Needing review: ${finance.needsReview}`,
      `- Reconciled: ${finance.reconciled}`,
      `- Totals by original currency: ${totals}`,
      "- Vendor names, individual amounts, order numbers, links, message ids and email text are deliberately withheld.",
    ].join("\n"),
    "Projects and work items [provenance: live database]: there is no authoritative projects or work-items table in this office, so none are recorded. Do not describe any project or work item as current.",
    [
      "Boundaries [provenance: system fact]:",
      "- Demonstration records from the early build are not included here and must not be reported as current status.",
      "- No external actions, payments, mailboxes or deployments are enabled from this office.",
      "- Safe Highways and Trail Tales are outside this project and are never modified.",
    ].join("\n"),
  ].join("\n\n");

  return { ok: true, text };
}
