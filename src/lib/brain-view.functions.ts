import { createServerFn } from "@tanstack/react-start";

const tok = (v: unknown) =>
  typeof (v as { accessToken?: unknown })?.accessToken === "string"
    ? (v as { accessToken: string }).accessToken.slice(0, 4000)
    : "";

export type BrainViewRest = (
  path: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; body: unknown }>;

/** Newest lines first; the view re-sorts. Bounded so a long history never slows the room. */
export const BRAIN_EVENTS_LIMIT = 2000;
export const BRAIN_EVENTS_QUERY = `office_work_events?select=id,subject_kind,subject_id,from_room,to_room,from_stage,to_stage,source,occurred_at&order=occurred_at.desc,id.desc&limit=${BRAIN_EVENTS_LIMIT}`;

/** One logbook line as plain strings (safe to send to the browser). Validation happens in brain-view.ts. */
export type BrainEventRow = {
  id: string;
  subject_kind: string;
  subject_id: string;
  from_room: string | null;
  to_room: string;
  from_stage: string | null;
  to_stage: string;
  source: string;
  occurred_at: string;
};

const str = (v: unknown, max = 120) =>
  typeof v === "string" ? v.slice(0, max) : v == null ? "" : String(v).slice(0, max);
const opt = (v: unknown) => (v == null || v === "" ? null : str(v, 60));

export function toBrainEventRow(r: Record<string, unknown>): BrainEventRow {
  return {
    id: str(r["id"], 80),
    subject_kind: str(r["subject_kind"], 20),
    subject_id: str(r["subject_id"], 80),
    from_room: opt(r["from_room"]),
    to_room: str(r["to_room"], 60),
    from_stage: opt(r["from_stage"]),
    to_stage: str(r["to_stage"], 20),
    source: str(r["source"], 40),
    occurred_at: str(r["occurred_at"], 40),
  };
}

/** Read the work logbook through the owner's token (owner-only row security). null = not readable. */
export async function readBrainEventsWith(
  rest: BrainViewRest,
): Promise<{ rows: BrainEventRow[]; capped: boolean } | null> {
  const r = await rest(BRAIN_EVENTS_QUERY).catch(() => null);
  if (!r?.ok || !Array.isArray(r.body)) return null;
  const rows = (r.body as Array<Record<string, unknown>>).map(toBrainEventRow);
  return { rows, capped: rows.length >= BRAIN_EVENTS_LIMIT };
}

export type BrainViewResult =
  | {
      ok: true;
      rows: BrainEventRow[];
      capped: boolean;
      readAt: string;
      live: { url: string; key: string };
    }
  | { ok: false; message: string };

/**
 * The live Brain view's one read. Also returns the public project address and
 * publishable key so the browser can listen for new logbook lines with John's
 * own sign-in (row security still applies to live updates).
 */
export const getBrainView = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => ({ accessToken: tok(v) }))
  .handler(async ({ data }): Promise<BrainViewResult> => {
    const b = await import("./canx-backend.server");
    const config = b.readBackendConfig();
    if (!config) return { ok: false, message: b.DENY_MESSAGES.backend_not_configured };
    const owner = await b.verifyOwner(data.accessToken);
    if (!owner.ok) return { ok: false, message: owner.message };
    const read = await readBrainEventsWith((p, i) => b.restRequest(config, data.accessToken, p, i));
    if (!read)
      return {
        ok: false,
        message:
          "The work logbook could not be read just now, so no activity is shown rather than guessing.",
      };
    return {
      ok: true,
      rows: read.rows,
      capped: read.capped,
      readAt: new Date().toISOString(),
      live: { url: config.url, key: config.publishableKey },
    };
  });
