/**
 * Compare-and-swap writer for the owner-only `finance_receipts.doc`.
 *
 * Every writer of the doc must use this. It reads `doc` + `updated_at`, applies
 * a pure mutation to the LATEST doc, then PATCHes with
 * `owner_id=eq.<owner>&updated_at=eq.<seen>` and `Prefer: return=representation`.
 * PostgREST returns the updated rows; an empty array means another writer
 * changed the row first (zero-row conditional update) — we re-read, re-apply
 * and retry a bounded number of times, then fail explicitly. The database row
 * lock makes the conditional update atomic; no in-process lock is relied on.
 * The ingestion RPC also bumps `updated_at`, so it invalidates stale writers.
 */
import { RECEIPTS_KIND, RECEIPTS_SCHEMA_VERSION } from "./finance-receipts";

export type Doc = Record<string, unknown>;
export type Rest = (
  config: never,
  token: string,
  path: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; body: unknown }>;

export const CAS_MAX_ATTEMPTS = 3;

export type CasResult =
  | { ok: true; doc: Doc; attempts: number }
  | { ok: false; reason: "read_failed" | "write_failed" | "conflict" | "unverified" | "aborted"; attempts: number };

const emptyDoc = (): Doc => ({ schemaVersion: RECEIPTS_SCHEMA_VERSION, kind: RECEIPTS_KIND, receipts: [] });

async function readRow(rest: Rest, config: unknown, token: string, ownerId: string) {
  const res = await rest(config as never, token, `finance_receipts?select=doc,updated_at&owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`);
  if (!res.ok) return { ok: false as const };
  const row = Array.isArray(res.body) ? (res.body[0] as { doc?: Doc; updated_at?: string } | undefined) : undefined;
  return { ok: true as const, exists: Boolean(row), doc: row?.doc ?? emptyDoc(), version: row?.updated_at ?? null };
}

/** Creates the owner's row if missing; never overwrites an existing row. */
async function ensureRow(rest: Rest, config: unknown, token: string, ownerId: string) {
  const res = await rest(config as never, token, "finance_receipts?on_conflict=owner_id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify([{ owner_id: ownerId, doc: emptyDoc() }]),
  });
  return res.ok;
}

/** Monotonic new version, always later than the one we saw. */
function nextVersion(seen: string | null) {
  const now = Date.now();
  const prior = seen ? Date.parse(seen) : 0;
  return new Date(Math.max(now, Number.isFinite(prior) ? prior + 1 : 0)).toISOString();
}

export async function casUpdateFinanceDoc(opts: {
  rest: Rest;
  config: unknown;
  token: string;
  ownerId: string;
  /** Pure: given the latest doc, return the next doc, or null to abort. */
  mutate: (latest: Doc) => Doc | null;
  /** Content check against the returned row (not just counts). */
  verify: (written: Doc) => boolean;
  maxAttempts?: number;
}): Promise<CasResult> {
  const max = opts.maxAttempts ?? CAS_MAX_ATTEMPTS;
  for (let attempt = 1; attempt <= max; attempt += 1) {
    let row = await readRow(opts.rest, opts.config, opts.token, opts.ownerId);
    if (!row.ok) return { ok: false, reason: "read_failed", attempts: attempt };
    if (!row.exists) {
      if (!(await ensureRow(opts.rest, opts.config, opts.token, opts.ownerId))) return { ok: false, reason: "write_failed", attempts: attempt };
      row = await readRow(opts.rest, opts.config, opts.token, opts.ownerId);
      if (!row.ok || !row.exists || !row.version) return { ok: false, reason: "read_failed", attempts: attempt };
    }
    const next = opts.mutate(row.doc);
    if (!next) return { ok: false, reason: "aborted", attempts: attempt };
    const path = `finance_receipts?owner_id=eq.${encodeURIComponent(opts.ownerId)}&updated_at=eq.${encodeURIComponent(row.version!)}&select=doc,updated_at`;
    const res = await opts.rest(opts.config as never, opts.token, path, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ doc: next, updated_at: nextVersion(row.version) }),
    });
    if (!res.ok) return { ok: false, reason: "write_failed", attempts: attempt };
    const rows = Array.isArray(res.body) ? (res.body as Array<{ doc?: Doc }>) : [];
    if (rows.length === 0) continue; // zero-row conditional update: someone else wrote first
    const written = rows[0]?.doc;
    if (!written || !opts.verify(written)) return { ok: false, reason: "unverified", attempts: attempt };
    return { ok: true, doc: written, attempts: attempt };
  }
  return { ok: false, reason: "conflict", attempts: max };
}
