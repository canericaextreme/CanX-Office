/**
 * Work Board sorting tools for Elsie (31 Oct 2026, John via Elsie): archive and
 * restore tasks, find saved items, and move links/files between rooms.
 *
 * Nothing here deletes. Archive is the existing "cancelled" status (the same
 * switch the 27 Oct cleanup used). Every change writes a before/after rollback
 * point to the change log, so it can be restored exactly.
 */
import type {
  JsonObject,
  ManagerTask,
  ManagerWorkError,
  WorkbenchDeps,
} from "./manager-work.functions";
import { FILE_FOLDERS, FILE_ROOMS } from "./office-files";

type Row = Record<string, unknown>;
const fail = (code: ManagerWorkError["code"], message: string): ManagerWorkError => ({
  ok: false,
  code,
  message,
});
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");
const str = (v: unknown) => (typeof v === "string" ? v : "");
const first = (data: unknown): Row | null =>
  Array.isArray(data) ? ((data[0] as Row) ?? null) : null;
const OPEN_STATES = ["open", "in_progress", "waiting"] as const;

async function owner(deps: WorkbenchDeps, token: string) {
  const v = await deps.verifyOwner(token);
  return v.ok ? v : fail("auth_not_ready", v.message);
}

async function readTask(deps: WorkbenchDeps, token: string, ownerId: string, taskId: string) {
  const r = await deps.rest<ManagerTask[]>(
    token,
    "GET",
    `manager_tasks?id=eq.${encodeURIComponent(taskId)}`,
  );
  const task = first(r.data) as ManagerTask | null;
  if (!r.ok || !task) return fail("not_found", "Task not found.");
  if (task.owner_id !== ownerId)
    return fail("forbidden", "That task belongs to a different owner.");
  return task;
}

const log = (
  deps: WorkbenchDeps,
  token: string,
  ownerId: string,
  action: string,
  entity: string,
  id: string,
  before: JsonObject,
  after: JsonObject,
) =>
  deps.rest(token, "POST", "rpc/log_manager_change", {
    _owner_id: ownerId,
    _action: action,
    _entity: entity,
    _entity_id: id,
    _before: before,
    _after: after,
  });

/** Archive = status "cancelled". The task, its result and its history all stay. */
export async function archiveManagerTaskWith(
  deps: WorkbenchDeps,
  input: { accessToken: string; taskId: string; reason: string },
): Promise<ManagerTask | ManagerWorkError> {
  const v = await owner(deps, input.accessToken);
  if (!v.ok) return v;
  const reason = clean(input.reason, 300);
  if (!reason) return fail("invalid_input", "Say why this task is being archived.");
  const before = await readTask(deps, input.accessToken, v.userId, input.taskId);
  if ("ok" in before) return before;
  if (before.status === "cancelled")
    return fail("invalid_input", `"${before.title}" is already archived. Nothing was changed.`);
  if (before.status === "done")
    return fail(
      "invalid_input",
      `"${before.title}" is already finished (done), so it is already off the open list. Nothing was changed.`,
    );

  // Keep the earlier result text; add the reason only when it still fits.
  const prior = str(before.result);
  const stamped = `${prior ? `${prior}\n` : ""}Archived ${new Date().toISOString().slice(0, 10)}: ${reason}`;
  const updated = await deps.rest<ManagerTask[]>(
    input.accessToken,
    "PATCH",
    `manager_tasks?id=eq.${encodeURIComponent(input.taskId)}`,
    {
      status: "cancelled",
      result: stamped.length <= 2000 ? stamped : prior,
      updated_at: new Date().toISOString(),
    },
  );
  const row = first(updated.data) as ManagerTask | null;
  if (!updated.ok || !row)
    return fail(
      "context_unavailable",
      updated.error ?? "The archive could not be saved. Nothing was changed.",
    );
  await log(
    deps,
    input.accessToken,
    v.userId,
    "task.archive",
    "manager_tasks",
    input.taskId,
    {
      status: before.status,
      result: prior,
      waiting_reason: str(before.waiting_reason),
      worker: str(before.worker),
      project: str(before.project),
    },
    { status: "cancelled", reason },
  ).catch(() => undefined);
  return row;
}

/**
 * Bring an archived (or finished) task back onto the open list, at the status
 * it had before it was archived when the change log still has it.
 */
export async function restoreManagerTaskWith(
  deps: WorkbenchDeps,
  input: { accessToken: string; taskId: string },
): Promise<(ManagerTask & { restoredTo: string }) | ManagerWorkError> {
  const v = await owner(deps, input.accessToken);
  if (!v.ok) return v;
  const before = await readTask(deps, input.accessToken, v.userId, input.taskId);
  if ("ok" in before) return before;
  if (before.status !== "cancelled" && before.status !== "done")
    return fail(
      "invalid_input",
      `"${before.title}" is not archived (it is ${before.status}). Nothing was changed.`,
    );

  let status: (typeof OPEN_STATES)[number] = "open";
  let waitingReason = "";
  if (before.status === "cancelled") {
    const history = await deps.rest<Row[]>(
      input.accessToken,
      "GET",
      `manager_changes?select=before&entity=eq.manager_tasks&entity_id=eq.${encodeURIComponent(input.taskId)}&action=in.(task.archive,task.cancel)&order=at.desc&limit=1`,
    );
    const was = first(history.data)?.["before"] as Row | undefined;
    const prev = str(was?.["status"]);
    if (prev === "in_progress") status = "in_progress";
    if (prev === "waiting" && clean(was?.["waiting_reason"], 300)) {
      status = "waiting";
      waitingReason = clean(was?.["waiting_reason"], 300);
    }
  }
  const updated = await deps.rest<ManagerTask[]>(
    input.accessToken,
    "PATCH",
    `manager_tasks?id=eq.${encodeURIComponent(input.taskId)}`,
    {
      status,
      waiting_reason: waitingReason,
      updated_at: new Date().toISOString(),
    },
  );
  const row = first(updated.data) as ManagerTask | null;
  if (!updated.ok || !row)
    return fail(
      "context_unavailable",
      updated.error ?? "The restore could not be saved. Nothing was changed.",
    );
  await log(
    deps,
    input.accessToken,
    v.userId,
    "task.restore",
    "manager_tasks",
    input.taskId,
    { status: before.status },
    { status, waiting_reason: waitingReason },
  ).catch(() => undefined);
  return { ...row, restoredTo: status };
}

export type SavedKind = "task" | "note" | "link" | "file";
export interface SavedMatch {
  kind: SavedKind;
  id: string;
  title: string;
  where: string;
}

/** Label notes are filing records, not things John saved; never offer them. */
const LABEL_SOURCES = ["Brain shelf: filing", "Brain index: category"];

/** Read-only search so Elsie can find the exact id before she changes anything. */
export async function findSavedItemsWith(
  deps: WorkbenchDeps,
  input: { accessToken: string; query: string; kind?: SavedKind | undefined },
): Promise<SavedMatch[] | ManagerWorkError> {
  const v = await owner(deps, input.accessToken);
  if (!v.ok) return v;
  // PostgREST filter syntax uses , ( ) * and . — keep words only.
  const words = clean(input.query, 80)
    .replace(/[^\p{L}\p{N} _-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (words.length < 2) return fail("invalid_input", "Say a word or two from the item's name.");
  const like = encodeURIComponent(`*${words}*`);
  const want = (k: SavedKind) => !input.kind || input.kind === k;
  const get = async (path: string) => {
    const r = await deps.rest<Row[]>(input.accessToken, "GET", path).catch(() => null);
    return r?.ok && Array.isArray(r.data) ? r.data : [];
  };
  const [tasks, notes, links, files] = await Promise.all([
    want("task")
      ? get(
          `manager_tasks?select=id,title,status,project&or=(title.ilike.${like},detail.ilike.${like})&order=updated_at.desc&limit=10`,
        )
      : [],
    want("note")
      ? get(
          `office_notes?select=id,title,source&title=ilike.${like}&source=not.in.(${LABEL_SOURCES.map(
            (s) => `"${s}"`,
          )
            .map(encodeURIComponent)
            .join(",")})&order=updated_at.desc&limit=10`,
        )
      : [],
    want("link")
      ? get(
          `office_links?select=id,title,room,folder&or=(title.ilike.${like},url.ilike.${like})&order=created_at.desc&limit=10`,
        )
      : [],
    want("file")
      ? get(
          `office_files?select=id,filename,room,folder&filename=ilike.${like}&order=created_at.desc&limit=10`,
        )
      : [],
  ]);
  return [
    ...tasks.map((r) => ({
      kind: "task" as const,
      id: str(r["id"]),
      title: str(r["title"]),
      where: `Work Board, ${str(r["status"])}${r["project"] ? `, project ${str(r["project"])}` : ""}`,
    })),
    ...notes.map((r) => ({
      kind: "note" as const,
      id: str(r["id"]),
      title: str(r["title"]),
      where: `Brain note, source ${str(r["source"])}`,
    })),
    ...links.map((r) => ({
      kind: "link" as const,
      id: str(r["id"]),
      title: str(r["title"]),
      where: `${str(r["room"])} room, folder ${str(r["folder"])}`,
    })),
    ...files.map((r) => ({
      kind: "file" as const,
      id: str(r["id"]),
      title: str(r["filename"]),
      where: `${str(r["room"])} room, folder ${str(r["folder"])}`,
    })),
  ];
}

/** Rooms a saved link or file can be moved between. Finance stays John's own. */
export const MOVABLE_ROOMS = FILE_ROOMS.map((r) => r.id).filter((id) => id !== "finance");

/** Move one saved link or file to another room (and optionally folder). The original is untouched. */
export async function moveSavedItemWith(
  deps: WorkbenchDeps,
  input: {
    accessToken: string;
    kind: "link" | "file";
    itemId: string;
    room: string;
    folder?: string | undefined;
  },
): Promise<{ title: string; from: string; to: string } | ManagerWorkError> {
  const v = await owner(deps, input.accessToken);
  if (!v.ok) return v;
  const room = clean(input.room, 60).toLowerCase().replace(/^\//, "");
  if (!MOVABLE_ROOMS.includes(room))
    return fail(
      "invalid_input",
      room === "finance"
        ? "Finance filing stays in John's hands; nothing was moved into Finance."
        : `"${room}" is not a room that holds saved links and files.`,
    );
  const folder = input.folder === undefined ? undefined : clean(input.folder, 120);
  if (folder !== undefined && folder !== "" && !FILE_FOLDERS.includes(folder))
    return fail("invalid_input", `Choose one of these folders: ${FILE_FOLDERS.join(", ")}.`);
  const table = input.kind === "link" ? "office_links" : "office_files";
  const name = input.kind === "link" ? "title" : "filename";
  const read = await deps.rest<Row[]>(
    input.accessToken,
    "GET",
    `${table}?select=id,owner_id,${name},room,folder&id=eq.${encodeURIComponent(input.itemId)}`,
  );
  const before = first(read.data);
  if (!read.ok || !before) return fail("not_found", `That saved ${input.kind} was not found.`);
  if (before["owner_id"] !== v.userId)
    return fail("forbidden", `That ${input.kind} belongs to a different owner.`);
  if (before["room"] === "finance")
    return fail(
      "invalid_input",
      "Items in Finance stay in John's hands; nothing was moved out of Finance.",
    );
  const patch: JsonObject = { room };
  if (folder) patch["folder"] = folder;
  const to = `${room} / ${folder || str(before["folder"])}`;
  const from = `${str(before["room"])} / ${str(before["folder"])}`;
  if (from === to) return fail("invalid_input", `It is already in ${to}. Nothing was changed.`);
  const saved = await deps.rest<Row[]>(
    input.accessToken,
    "PATCH",
    `${table}?id=eq.${encodeURIComponent(input.itemId)}&owner_id=eq.${encodeURIComponent(v.userId)}`,
    patch,
  );
  const row = first(saved.data);
  if (!saved.ok || !row || row["room"] !== room) {
    return fail(
      "context_unavailable",
      input.kind === "link"
        ? "The move was not saved. The same link may already be filed in that room and folder. Nothing was changed."
        : "The move was not saved. Nothing was changed.",
    );
  }
  await log(
    deps,
    input.accessToken,
    v.userId,
    `${input.kind}.move`,
    table,
    input.itemId,
    { room: str(before["room"]), folder: str(before["folder"]) },
    { room, folder: str(row["folder"]) },
  ).catch(() => undefined);
  return { title: str(before[name]), from, to };
}

/** Most tasks one stale sweep will touch, so one request can never rewrite the whole board. */
export const STALE_SWEEP_LIMIT = 25;
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", {
    day: "numeric",
    month: "short",
    timeZone: "America/Dawson_Creek",
  });

/**
 * Stale sweep (1 Nov 2026, John: "take care of those stale items").
 * A task still marked "in progress" with no update for the pre-trip's stalled
 * window is not really being worked on, so it moves to Waiting with a plain
 * reason. Nothing is archived or deleted, each move logs a rollback point, and
 * update_task (status in_progress) puts it back. preview lists without changing.
 */
export async function sweepStaleTasksWith(
  deps: WorkbenchDeps,
  input: { accessToken: string; preview?: boolean; now?: number; stalledAfterMs: number },
): Promise<
  | {
      moved: Array<{ id: string; title: string; since: string }>;
      failed: string[];
      preview: boolean;
      more: number;
    }
  | ManagerWorkError
> {
  const v = await owner(deps, input.accessToken);
  if (!v.ok) return v;
  const now = input.now ?? Date.now();
  const cutoff = new Date(now - input.stalledAfterMs).toISOString();
  const r = await deps.rest<ManagerTask[]>(
    input.accessToken,
    "GET",
    `manager_tasks?select=id,title,status,worker,updated_at,owner_id&status=eq.in_progress&updated_at=lt.${encodeURIComponent(cutoff)}&order=updated_at.asc`,
  );
  if (!r.ok || !Array.isArray(r.data))
    return fail(
      "context_unavailable",
      r.error ?? "The Work Board could not be read. Nothing was changed.",
    );
  const stale = (r.data as ManagerTask[]).filter(
    (t) =>
      t.owner_id === v.userId &&
      t.status === "in_progress" &&
      Date.parse(str(t.updated_at)) < now - input.stalledAfterMs,
  );
  const batch = stale.slice(0, STALE_SWEEP_LIMIT);
  const today = shortDate(new Date(now).toISOString());
  const moved: Array<{ id: string; title: string; since: string }> = [];
  const failed: string[] = [];
  for (const t of batch) {
    const since = shortDate(str(t.updated_at));
    if (input.preview) {
      moved.push({ id: t.id, title: t.title, since });
      continue;
    }
    const worker = clean(t.worker, 80);
    const reason = `Stale sweep ${today}: no update since ${since}. Needs ${worker || "a worker"} to report back, or John to restart it.`;
    const updated = await deps.rest<ManagerTask[]>(
      input.accessToken,
      "PATCH",
      `manager_tasks?id=eq.${encodeURIComponent(t.id)}&status=eq.in_progress`,
      { status: "waiting", waiting_reason: reason, updated_at: new Date(now).toISOString() },
    );
    if (!updated.ok || !first(updated.data)) {
      failed.push(t.title);
      continue;
    }
    await log(
      deps,
      input.accessToken,
      v.userId,
      "task.update",
      "manager_tasks",
      t.id,
      { status: "in_progress", waiting_reason: "" },
      { status: "waiting", waiting_reason: reason, sweep: "stale" },
    ).catch(() => undefined);
    moved.push({ id: t.id, title: t.title, since });
  }
  return { moved, failed, preview: Boolean(input.preview), more: stale.length - batch.length };
}
