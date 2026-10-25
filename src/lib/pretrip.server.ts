/**
 * Elsie's daily pre-trip runner — SERVER ONLY. Reads run as John's own session
 * (RLS applies). The only writes are one new pre-trip record in office_notes.
 * The only paid calls are the two approved colleague message tests.
 * Every check has its own time limit; a slow check becomes "unverified" and
 * the inspection still finishes, so it can never trap Elsie.
 */
import { ROOM_TARGETS, type RoomSnapshot, type RoomTarget } from "./room-snapshot";
import {
  PRETRIP_CHECK_TIMEOUT_MS, PRETRIP_REPEAT_WINDOW_MS, PRETRIP_SCHEMA, PRETRIP_SOURCE, PRETRIP_TOTAL_TIMEOUT_MS, STALLED_AFTER_MS,
  classifyRoom, compactDate, compareWithPrevious, countLedger, localDate, localHour, morningReport, overallLight, parsePreTrip, preTripId,
  type ColleagueTest, type PreTripCheck, type PreTripRecord, type PreTripTrigger,
} from "./pretrip";
import type { Colleague } from "./pretrip-colleague";

export type PreTripRest = (path: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; body: unknown }>;

export interface PreTripDeps {
  rest: PreTripRest;
  readRoom: (target: RoomTarget) => Promise<RoomSnapshot>;
  /** Approved paid message test; absent means the test is not wired and the rows stay unverified. */
  ping?: ((c: Colleague, code: string, sharedTitle: string) => Promise<ColleagueTest>) | undefined;
  ownerId: string;
  aal: string;
  now?: () => Date;
  randomCode?: () => string;
  checkTimeoutMs?: number;
}

export type PreTripRunResult =
  | { ok: true; record: PreTripRecord; saved: boolean; repeated: boolean; detail: string }
  | { ok: false; detail: string };

type Row = Record<string, unknown>;
const owner = (id: string) => `owner_id=eq.${encodeURIComponent(id)}`;
const clip = (s: unknown, n = 160) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");
const rowsOf = (b: unknown): Row[] => (Array.isArray(b) ? b.filter((r): r is Row => !!r && typeof r === "object") : []);
const ago = (iso: unknown, now: Date) => {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "time not recorded";
  const h = Math.max(0, Math.round((now.getTime() - t) / 3_600_000));
  return h < 1 ? "under an hour ago" : h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

class TimedOut extends Error {}
function within<T>(ms: number, p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimedOut()), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Run one check; a failure or timeout is reported as unverified, never green. */
async function guard(ms: number, fallback: Omit<PreTripCheck, "status" | "detail">, run: () => Promise<PreTripCheck | PreTripCheck[]>): Promise<PreTripCheck[]> {
  try {
    const r = await within(ms, run());
    return Array.isArray(r) ? r : [r];
  } catch (e) {
    return [{ ...fallback, status: "unverified", detail: e instanceof TimedOut ? `Timed out after ${Math.round(ms / 1000)} s` : "The check could not run" }];
  }
}

export async function readLatestPreTrip(rest: PreTripRest, ownerId: string, before?: string): Promise<{ ok: boolean; record: PreTripRecord | null }> {
  const cut = before ? `&id=lt.pretrip-${compactDate(before)}` : "";
  const r = await rest(`office_notes?select=id,detail,updated_at&${owner(ownerId)}&id=like.pretrip-2*${cut}&order=id.desc&limit=5`).catch(() => null);
  if (!r?.ok) return { ok: false, record: null };
  const records = rowsOf(r.body).map((x) => parsePreTrip(x["detail"])).filter((x): x is PreTripRecord => !!x);
  // Daily and manual ids for the same date sort by id; pick the newest finished run.
  records.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  return { ok: true, record: records[0] ?? null };
}

export async function runPreTripWith(deps: PreTripDeps, trigger: PreTripTrigger): Promise<PreTripRunResult> {
  if (!/^[0-9a-f-]{36}$/i.test(deps.ownerId)) return { ok: false, detail: "Owner not verified. No inspection ran." };
  const now = deps.now ?? (() => new Date());
  const start = now();
  const date = localDate(start);
  const id = preTripId(date, trigger, start);
  const ms = deps.checkTimeoutMs ?? PRETRIP_CHECK_TIMEOUT_MS;

  // Repeat protection: the daily run happens once per day; a quick second manual request returns the run just made.
  const latest = await readLatestPreTrip(deps.rest, deps.ownerId);
  if (!latest.ok) return { ok: false, detail: "Saved pre-trip records could not be read, so no inspection was started (it might duplicate one). Try again shortly." };
  const last = latest.record;
  if (last && last.date === date && (trigger === "daily" || start.getTime() - Date.parse(last.finishedAt) < PRETRIP_REPEAT_WINDOW_MS))
    return { ok: true, record: last, saved: true, repeated: true, detail: `Today's pre-trip already ran at ${last.finishedAt}; showing that one.` };

  const previous = (await readLatestPreTrip(deps.rest, deps.ownerId, date)).record;
  const deadline = start.getTime() + PRETRIP_TOTAL_TIMEOUT_MS;
  const left = () => Math.max(1_000, Math.min(ms, deadline - now().getTime()));
  const get = async (path: string) => {
    const r = await deps.rest(path);
    if (!r.ok) throw new Error(`read failed ${r.status}`);
    return rowsOf(r.body);
  };

  let outstanding: number | null = null, approvals: number | null = null, yesterday = "", sharedTitle = "";
  const email: PreTripRecord["email"] = { sweep: "not checked", needsAttention: null, archive: null, ignored: null };

  // Work Board first: the colleague test quotes one real task title back.
  const work = await guard(left(), { id: "work-board", area: "Work Board", label: "Work Board" }, async () => {
    const tasks = await get(`manager_tasks?select=id,title,status,updated_at,risk&${owner(deps.ownerId)}&status=in.(open,in_progress,waiting)&order=updated_at.desc&limit=200`);
    outstanding = tasks.length;
    sharedTitle = clip(tasks[0]?.["title"], 120);
    const stalled = tasks.filter((t) => t["status"] === "in_progress" && start.getTime() - Date.parse(String(t["updated_at"])) > STALLED_AFTER_MS);
    const waiting = tasks.filter((t) => t["status"] === "waiting").length;
    return {
      id: "work-board", area: "Work Board", label: "Work Board", status: stalled.length ? "yellow" : "green",
      detail: clip(`${tasks.length} unfinished (${waiting} waiting). ${stalled.length ? `${stalled.length} in progress with no update for 2+ days: ${stalled.slice(0, 3).map((t) => clip(t["title"], 50)).join("; ")}` : "No stalled work found."}`, 300),
    };
  });

  const code = (deps.randomCode ?? (() => Math.random().toString(36).slice(2, 8).toUpperCase()))();
  const colleagues = (["chatgpt", "claude"] as const).map((c) => {
    const label = `${c === "chatgpt" ? "ChatGPT" : "Claude"} (Office helper) message test`;
    const base = { id: `colleague:${c}`, area: "AI team", label };
    if (!deps.ping) return Promise.resolve([{ ...base, status: "unverified" as const, detail: "Message test is not wired on this server. Nothing sent." }]);
    if (!sharedTitle) return Promise.resolve([{ ...base, status: "unverified" as const, detail: "No shared Work Board task could be read to include in the test. Nothing sent." }]);
    return guard(left() + 2_000, base, async () => {
      const t = await deps.ping!(c, code, sharedTitle);
      const status = t.verified ? "green" : t.sent ? "yellow" : "unverified";
      const detail = t.verified
        ? `Two-way OK in ${((t.ms ?? 0) / 1000).toFixed(1)} s: reply carried the one-time code and quoted the shared task (${t.model ?? "model unknown"}, response ${t.responseId ?? "id not given"}).`
        : `Not passed: ${t.failure ?? "unknown"}${t.ms !== null ? ` after ${(t.ms / 1000).toFixed(1)} s` : ""}.`;
      return { ...base, status, detail: clip(detail, 300) };
    });
  });

  const checks = await Promise.all([
    ...colleagues,
    guard(left(), { id: "native", area: "AI team", label: "John's own ChatGPT and Claude apps" }, async () => {
      const notes = await get(`office_notes?select=id,updated_at&${owner(deps.ownerId)}&id=in.(handoff-latest-claude,handoff-latest-chatgpt)`);
      const at = (n: string) => notes.find((x) => x["id"] === n)?.["updated_at"];
      return (["chatgpt", "claude"] as const).map((c) => ({
        id: `native:${c}`, area: "AI team", label: `${c === "chatgpt" ? "ChatGPT" : "Claude"} app (John's own chat)`, status: "unverified" as const,
        detail: `Last saved a Brain handoff ${ago(at(`handoff-latest-${c}`), start)}. Elsie cannot message John's own ${c === "chatgpt" ? "ChatGPT" : "Claude"} chats, so this is "last seen", not a live test.`,
      }));
    }),
    guard(left(), { id: "brain", area: "Brain", label: "CanX Brain" }, async () => {
      const notes = await get(`office_notes?select=id,updated_at&${owner(deps.ownerId)}&order=updated_at.desc&limit=3&or=(source.is.null,source.neq.Office%20Hours%3A%20v1)`);
      return { id: "brain", area: "Brain", label: "CanX Brain", status: notes.length ? "green" : "yellow", detail: notes.length ? `Readable; newest note saved ${ago(notes[0]!["updated_at"], start)}.` : "Readable but no notes found." };
    }),
    guard(left(), { id: "continuity", area: "Memory", label: "Yesterday's work and decisions" }, async () => {
      const [summaries, recent] = await Promise.all([
        get(`astra_conversation_summaries?select=summary,open_loops,updated_at&${owner(deps.ownerId)}&order=updated_at.desc&limit=1`),
        get(`astra_recent_context?select=created_at&${owner(deps.ownerId)}&conversation_key=eq.office-manager&order=created_at.desc&limit=1`),
      ]);
      const s = summaries[0];
      yesterday = clip(s?.["summary"], 300);
      const loops = Array.isArray(s?.["open_loops"]) ? (s!["open_loops"] as unknown[]).length : 0;
      const lastTurn = recent[0]?.["created_at"];
      const fresh = typeof lastTurn === "string" && start.getTime() - Date.parse(lastTurn) < 3 * 86_400_000;
      return {
        id: "continuity", area: "Memory", label: "Yesterday's work and decisions", status: s || fresh ? (fresh ? "green" : "yellow") : "yellow",
        detail: clip(`Last talk with Elsie ${ago(lastTurn, start)}. ${s ? `Latest summary saved ${ago(s["updated_at"], start)}, ${loops} open item${loops === 1 ? "" : "s"}.` : "No conversation summary saved."}`, 240),
      };
    }),
    guard(left(), { id: "approvals", area: "Approvals", label: "Pending approvals" }, async () => {
      const rows = await get(`manager_approvals?select=id&${owner(deps.ownerId)}&status=eq.pending&limit=100`);
      approvals = rows.length;
      return { id: "approvals", area: "Approvals", label: "Pending approvals", status: "green", detail: rows.length ? `${rows.length} waiting for John's decision.` : "Nothing waiting." };
    }),
    guard(left(), { id: "spending", area: "Money", label: "AI spending limits" }, async () => {
      const r = await deps.rest("rpc/manager_budget_status", { method: "POST", body: JSON.stringify({ _owner_id: deps.ownerId }) });
      const row = (Array.isArray(r.body) ? r.body[0] : r.body) as Row | undefined;
      if (!r.ok || !row || typeof row !== "object") throw new Error("budget unreadable");
      const cents = (v: unknown) => `$${(Number(v) / 100).toFixed(2)}`;
      const status = row["paused"] === true ? "red" : row["warning"] === true ? "yellow" : "green";
      return { id: "spending", area: "Money", label: "AI spending limits", status, detail: `Used ${cents(row["used_cents"])} of ${cents(row["ceiling_cents"])} this month${status === "red" ? "; paid AI is paused" : status === "yellow" ? "; past the warning point" : ""}. Outside providers' own bills are not read here.` };
    }),
    guard(left(), { id: "email", area: "Email", label: "6 a.m. email sweep" }, async () => {
      const day = compactDate(date);
      const [receipt, ledgers] = await Promise.all([
        get(`office_notes?select=id,title,updated_at&${owner(deps.ownerId)}&id=eq.email-sweep-receipt-${day}&limit=1`),
        get(`office_notes?select=detail&${owner(deps.ownerId)}&id=like.email-ledger-${day}-*&limit=40`),
      ]);
      const base = { id: "email", area: "Email", label: "6 a.m. email sweep" };
      if (!receipt.length) {
        email.sweep = localHour(start) < 8 ? "today's sweep hasn't been saved yet" : "no sweep receipt saved for today";
        return { ...base, status: localHour(start) < 8 ? "unverified" : "yellow", detail: `No email sweep receipt for ${date} (${localHour(start) < 8 ? "it normally runs around 6 a.m." : "it should have run by now"}). Elsie did not search Gmail herself.` };
      }
      const n = countLedger(ledgers.map((l) => String(l["detail"] ?? "")));
      email.sweep = clip(receipt[0]!["title"], 140);
      email.needsAttention = n.needsAttention; email.archive = n.archive; email.ignored = n.ignored;
      return { ...base, status: "green", detail: clip(`Sweep saved ${ago(receipt[0]!["updated_at"], start)}: ${n.total} emails in the ledger; ${n.needsAttention} need attention, ${n.archive} could be archived, ${n.ignored} ignored by your rules. Delete candidates: not counted (no delete rules exist).`, 300) };
    }),
    guard(left(), { id: "workers", area: "Workers", label: "Background workers" }, async () => ({
      id: "workers", area: "Workers", label: "Background workers", status: "unverified",
      detail: "No unattended worker is verified as running. The Office cannot see Claude's hourly pickup routine or its pause switch.",
    })),
    guard(left(), { id: "security", area: "Security", label: "Sign-in" }, async () => ({
      id: "security", area: "Security", label: "Sign-in", status: deps.aal === "aal2" ? "green" : "yellow",
      detail: deps.aal === "aal2" ? "This session passed two-step sign-in." : "This session has not passed two-step sign-in; Finance and Legal rooms can't be checked.",
    })),
    guard(left(), { id: "backups", area: "Security", label: "Backups and restore test" }, async () => ({
      id: "backups", area: "Security", label: "Backups and restore test", status: "unverified",
      detail: "The Office keeps no backup or restore-test record that Elsie can read.",
    })),
    ...ROOM_TARGETS.map((t) => guard(left(), { id: `room:${t.route}`, area: "Rooms", label: t.label }, async () => classifyRoom(await deps.readRoom(t)))),
  ]);

  const flat = [...work, ...checks.flat()];
  const compared = compareWithPrevious(flat, previous, date);
  const finished = now();
  const rooms = compared.checks.filter((c) => c.area === "Rooms");
  const record: PreTripRecord = {
    schema: PRETRIP_SCHEMA, id, date, trigger,
    startedAt: start.toISOString(), finishedAt: finished.toISOString(),
    inspection: compared.checks.some((c) => /Timed out|could not run/.test(c.detail)) ? "partial" : "complete",
    overall: overallLight(compared.checks),
    checks: compared.checks,
    rooms: { total: ROOM_TARGETS.length, verified: rooms.filter((c) => c.status === "green").length },
    email, outstanding, approvals, yesterday,
    changes: compared.changes,
    previousId: previous?.id ?? null,
  };

  const detail = JSON.stringify(record);
  const title = `Pre-trip ${date} (${trigger}): ${record.overall}, ${record.rooms.verified}/${record.rooms.total} rooms green`;
  const saved = await deps.rest("office_notes", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ id, owner_id: deps.ownerId, kind: "decision", title, detail, source: PRETRIP_SOURCE, provenance: "ai-proposal" }),
  }).catch(() => null);
  if (!saved?.ok) {
    // A daily id that already exists means another tab finished first: show that record, never a duplicate.
    if (saved?.status === 409) {
      const again = await readLatestPreTrip(deps.rest, deps.ownerId);
      if (again.record?.date === date) return { ok: true, record: again.record, saved: true, repeated: true, detail: "Another window finished today's pre-trip first; showing that one." };
    }
    return { ok: true, record, saved: false, repeated: false, detail: "Inspection finished but the record could not be saved to the Brain. Results are shown once, not stored." };
  }
  const back = await deps.rest(`office_notes?select=detail&${owner(deps.ownerId)}&id=eq.${encodeURIComponent(id)}&limit=1`).catch(() => null);
  const verified = !!back?.ok && rowsOf(back.body)[0]?.["detail"] === detail;
  return {
    ok: true, record, saved: verified, repeated: false,
    detail: verified ? `Saved and read back as Brain record ${id}. ${morningReport(record)}` : `Saved, but the readback did not match, so record ${id} is not verified.`,
  };
}

/** Elsie's context line: one quick read, capped at 1.5 s so it can never slow her reply. */
export async function readPreTripForElsie(rest: PreTripRest, ownerId: string, now: Date): Promise<string> {
  const { preTripForElsie } = await import("./pretrip");
  try {
    const r = await within(1_500, readLatestPreTrip(rest, ownerId));
    return r.ok ? preTripForElsie(r.record, now) : "DAILY PRE-TRIP: saved record could not be read. Do not guess today's Office status.";
  } catch {
    return "DAILY PRE-TRIP: saved record could not be read in time. Do not guess today's Office status.";
  }
}
