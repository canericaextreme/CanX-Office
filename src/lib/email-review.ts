/**
 * Emails review card (Work Board tasks c5b100ba "Add an Emails review card for
 * sweep results" and defe88bc "Add Accept and Ignore controls", John 23 Oct 2026).
 *
 * The 6 a.m. email sweep (an outside assistant job, not Office code) saves what
 * it screened as Brain notes `email-ledger-YYYYMMDD-N` (a JSON array of entries).
 * This file turns those into a short review list for the last 48 hours and keeps
 * John's choices:
 *  - "Accept this email" only records that John is happy it was collected.
 *  - "Ignore this email" records the choice AND adds the sender to the standing
 *    exclusion note `email-sweep-owner-exclusions`, which the sweep reads, so it
 *    is left out of future sweeps. Gmail itself is never touched.
 * Pure functions only; the server calls are in email-review.functions.ts.
 */

export const EXCLUSIONS_NOTE_ID = "email-sweep-owner-exclusions";
export const DECISIONS_NOTE_ID = "email-review-decisions";
export const REVIEW_WINDOW_MS = 48 * 3_600_000;
const MAX_DECISIONS = 300;
const MAX_EXCLUSION_DETAIL = 3800;

export type EmailDecision = "accept" | "ignore";

export interface EmailReviewEntry {
  messageId: string;
  mailbox: string;
  from: string;
  /** Lower-case sender address taken from `from`, or "" when none is readable. */
  sender: string;
  subject: string;
  received: string;
  outcome: string;
  url: string;
}

const s = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max).trim() : "");

/** "TELUS Team paymybill@telus.com" or "Name <a@b.c>" → "paymybill@telus.com". */
export function senderAddress(from: string): string {
  const m = from.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : "";
}

function outcomeText(o: unknown): string {
  if (typeof o === "string") return s(o, 200);
  if (o && typeof o === "object") return s((o as { status?: unknown }).status, 200);
  return "";
}

/** Ledger note details (untrusted JSON text) → entries received inside the window, newest first, no duplicates. */
export function parseLedgerEntries(details: readonly string[], now: number, windowMs = REVIEW_WINDOW_MS): EmailReviewEntry[] {
  const seen = new Set<string>();
  const out: EmailReviewEntry[] = [];
  for (const d of details) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(d);
    } catch {
      continue;
    }
    const items = Array.isArray(parsed) ? parsed : [];
    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      const row = it as Record<string, unknown>;
      const messageId = s(row["messageId"], 80) || s(row["id"], 80);
      const received = s(row["received"], 40);
      const t = Date.parse(received);
      if (!messageId || seen.has(messageId) || !Number.isFinite(t) || now - t > windowMs) continue;
      seen.add(messageId);
      const from = s(row["from"], 200);
      const url = s(row["url"], 400);
      out.push({
        messageId,
        mailbox: s(row["mailbox"], 120),
        from,
        sender: senderAddress(from),
        subject: s(row["subject"], 200) || "(no subject)",
        received,
        outcome: outcomeText(row["outcome"]),
        url: url.startsWith("https://mail.google.com/") ? url : "",
      });
    }
  }
  return out.sort((a, b) => Date.parse(b.received) - Date.parse(a.received));
}

/** Ledger note ids for the days a 48-hour window can touch (UTC dates, as the sweep names them). */
export function ledgerDays(now: number, windowMs = REVIEW_WINDOW_MS): string[] {
  const days = new Set<string>();
  for (let t = now - windowMs; t <= now + 3_600_000; t += 6 * 3_600_000) days.add(new Date(t).toISOString().slice(0, 10).replace(/-/g, ""));
  days.add(new Date(now).toISOString().slice(0, 10).replace(/-/g, ""));
  return [...days].sort();
}

export function readDecisions(detail: string | null | undefined): Record<string, EmailDecision> {
  try {
    const parsed = JSON.parse(detail ?? "") as { decisions?: Record<string, { d?: unknown }> };
    const out: Record<string, EmailDecision> = {};
    for (const [id, v] of Object.entries(parsed.decisions ?? {})) if (v?.d === "accept" || v?.d === "ignore") out[id] = v.d;
    return out;
  } catch {
    return {};
  }
}

/** Adds one choice; keeps only the newest MAX_DECISIONS so the note stays small. */
export function withDecision(detail: string | null | undefined, messageId: string, decision: EmailDecision, at: string): string {
  let decisions: Record<string, { d: EmailDecision; at: string }> = {};
  try {
    const parsed = JSON.parse(detail ?? "") as { decisions?: Record<string, { d: EmailDecision; at: string }> };
    decisions = parsed.decisions ?? {};
  } catch {
    decisions = {};
  }
  decisions[messageId] = { d: decision, at };
  const kept = Object.entries(decisions)
    .sort((a, b) => (a[1].at < b[1].at ? 1 : -1))
    .slice(0, MAX_DECISIONS);
  return JSON.stringify({ v: 1, decisions: Object.fromEntries(kept) });
}

/** True when the exclusion note already names this exact address. */
export function isSenderExcluded(exclusions: string | null | undefined, sender: string): boolean {
  return Boolean(sender) && (exclusions ?? "").toLowerCase().includes(sender.toLowerCase());
}

/**
 * Appends one exact sender line to the standing exclusion note. Returns null when
 * nothing needs saving (already listed, no address) or the note would grow too large.
 */
export function withExcludedSender(exclusions: string | null | undefined, sender: string, date: string): string | null {
  const address = senderAddress(sender);
  if (!address || isSenderExcluded(exclusions, address)) return null;
  const base = (exclusions ?? "").trim() || "STANDING OWNER RULE for the 6 a.m. email sweep (both Gmail accounts). Do not collect, file, ledger as Office items, or import to Finance any message from these senders. Count them only as 'owner-excluded'. Never block, delete, archive, label or change the Gmail messages themselves.";
  const next = `${base} Also excluded: ${address} (John pressed Ignore on the Emails card, ${date}).`;
  return next.length > MAX_EXCLUSION_DETAIL ? null : next;
}
