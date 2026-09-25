/**
 * Cross-device checkpoint of Astra's completed conversation turns.
 *
 * Owner-verified (AAL2) on the server; every read and write runs as the
 * owner's own session so RLS applies. The append is idempotent by turn id,
 * and a turn counts as saved only after an exact readback. No AI call here.
 * Needs migration docs/migrations/0008_astra_conversation_checkpoints.sql;
 * until it is applied, results say "unavailable" and nothing is claimed.
 */
import { createServerFn } from "@tanstack/react-start";
import type { OwnerVerification } from "./canx-backend.server";
import type { Rest } from "./astra-continuity";

export interface CheckpointTurn { turnId: string; seq: number; user: string; answer: string; at: string; mode: "text" | "voice" }
export interface CheckpointDeps { verify: (token: string) => Promise<OwnerVerification>; rest: (token: string) => Rest | null }
export type AppendResult = { ok: boolean; state: "saved" | "duplicate" | "unavailable" | "denied" | "failed"; message: string };
export type LoadResult =
  | { ok: true; turns: CheckpointTurn[]; readAt: string; message: string }
  | { ok: false; state: "unavailable" | "denied" | "failed"; turns: []; readAt: string; message: string };

const UUID = /^[0-9a-f-]{36}$/i;
export const CHECKPOINT_READ_LIMIT = 30;
const UNAVAILABLE = "Cross-device conversation checkpoint is not set up in the CanX database yet (migration 0008 not applied). Kept on this device only.";

export function cleanCheckpointInput(raw: unknown): CheckpointTurn | null {
  const t = (raw ?? {}) as Record<string, unknown>;
  const turnId = typeof t["turnId"] === "string" && UUID.test(t["turnId"]) ? t["turnId"] : "";
  const user = typeof t["user"] === "string" ? t["user"].trim().slice(0, 4000) : "";
  const answer = typeof t["answer"] === "string" ? t["answer"].trim().slice(0, 4000) : "";
  const seq = typeof t["seq"] === "number" && Number.isInteger(t["seq"]) && t["seq"] > 0 && t["seq"] < 1e9 ? t["seq"] : 0;
  const at = typeof t["at"] === "string" && !Number.isNaN(Date.parse(t["at"])) ? new Date(t["at"]).toISOString() : "";
  if (!turnId || !user || !answer || !seq || !at) return null;
  return { turnId, seq, user, answer, at, mode: t["mode"] === "voice" ? "voice" : "text" };
}

const missing = (status: number, body: unknown) => {
  const code = (body as { code?: string } | null)?.code;
  return status === 404 || code === "PGRST202" || code === "PGRST205" || code === "42P01" || code === "42883";
};

export async function appendCheckpointWith(deps: CheckpointDeps, input: { accessToken: string; turn: unknown }): Promise<AppendResult> {
  const turn = cleanCheckpointInput(input.turn);
  if (!turn) return { ok: false, state: "failed", message: "The conversation turn was not valid, so it was not saved." };
  const owner = await deps.verify(input.accessToken);
  if (!owner.ok) return { ok: false, state: "denied", message: owner.message };
  const rest = deps.rest(input.accessToken);
  if (!rest) return { ok: false, state: "unavailable", message: "No CanX database is configured. Kept on this device only." };
  const write = await rest("rpc/append_astra_checkpoint", {
    method: "POST",
    body: JSON.stringify({ _turn_id: turn.turnId, _mode: turn.mode, _user_text: turn.user, _answer_text: turn.answer, _client_seq: turn.seq, _client_at: turn.at }),
  }).catch(() => ({ ok: false, status: 0, body: null as unknown }));
  if (!write.ok) {
    if (missing(write.status, write.body)) return { ok: false, state: "unavailable", message: UNAVAILABLE };
    if (write.status === 401 || write.status === 403) return { ok: false, state: "denied", message: "The CanX database refused this save. Sign in again with your authenticator." };
    return { ok: false, state: "failed", message: "The account checkpoint was not confirmed. Kept on this device; it will retry." };
  }
  // Readback: only the exact stored text for this owner and turn counts.
  const back = await rest(`astra_conversation_checkpoints?select=turn_id,user_text,answer_text&owner_id=eq.${encodeURIComponent(owner.userId)}&turn_id=eq.${turn.turnId}&limit=1`)
    .catch(() => ({ ok: false, status: 0, body: null as unknown }));
  const row = back.ok && Array.isArray(back.body) ? (back.body[0] as Record<string, unknown> | undefined) : undefined;
  if (!row || row["user_text"] !== turn.user || row["answer_text"] !== turn.answer)
    return { ok: false, state: "failed", message: "The account checkpoint could not be read back. Kept on this device; it will retry." };
  const inserted = (Array.isArray(write.body) ? write.body[0] : write.body) as { inserted?: unknown } | null;
  return inserted?.inserted === false
    ? { ok: true, state: "duplicate", message: "Already in your CanX account checkpoint; not saved twice." }
    : { ok: true, state: "saved", message: "Saved to your CanX account checkpoint and read back." };
}

export async function loadCheckpointWith(deps: CheckpointDeps, input: { accessToken: string }, now = new Date()): Promise<LoadResult> {
  const readAt = now.toISOString();
  const owner = await deps.verify(input.accessToken);
  if (!owner.ok) return { ok: false, state: "denied", turns: [], readAt, message: owner.message };
  const rest = deps.rest(input.accessToken);
  if (!rest) return { ok: false, state: "unavailable", turns: [], readAt, message: "No CanX database is configured." };
  const r = await rest(`astra_conversation_checkpoints?select=turn_id,mode,user_text,answer_text,server_seq,client_at&owner_id=eq.${encodeURIComponent(owner.userId)}&order=server_seq.desc&limit=${CHECKPOINT_READ_LIMIT}`)
    .catch(() => ({ ok: false, status: 0, body: null as unknown }));
  if (!r.ok || !Array.isArray(r.body)) {
    if (!r.ok && missing(r.status, r.body)) return { ok: false, state: "unavailable", turns: [], readAt, message: UNAVAILABLE };
    return { ok: false, state: "failed", turns: [], readAt, message: "The account conversation checkpoint could not be read. Showing this device's copy only." };
  }
  const turns = (r.body as Record<string, unknown>[])
    .map((x) => cleanCheckpointInput({ turnId: x["turn_id"], seq: x["server_seq"], user: x["user_text"], answer: x["answer_text"], at: x["client_at"], mode: x["mode"] }))
    .filter((t): t is CheckpointTurn => !!t)
    .reverse();
  return { ok: true, turns, readAt, message: `Last conversation: ${turns.length} turns read from your CanX account checkpoint.` };
}

async function deps(): Promise<CheckpointDeps> {
  const backend = await import("./canx-backend.server");
  const config = backend.readBackendConfig();
  return {
    verify: (token) => backend.verifyOwnerWith(config, token),
    rest: (token) => (config ? (path, init) => backend.restRequest(config, token, path, init) : null),
  };
}

const tokenOf = (raw: unknown) => {
  const t = (raw as { accessToken?: unknown } | null)?.accessToken;
  return typeof t === "string" ? t.slice(0, 4000) : "";
};

export const appendAstraCheckpoint = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ accessToken: tokenOf(raw), turn: (raw as { turn?: unknown } | null)?.turn ?? null }))
  .handler(async ({ data }) => appendCheckpointWith(await deps(), data));

export const loadAstraCheckpoint = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ accessToken: tokenOf(raw) }))
  .handler(async ({ data }) => loadCheckpointWith(await deps(), data));
