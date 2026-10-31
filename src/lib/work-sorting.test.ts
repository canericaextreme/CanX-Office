import { describe, expect, it, vi } from "vitest";
import type { WorkbenchDeps } from "./manager-work.functions";
import {
  archiveManagerTaskWith,
  findSavedItemsWith,
  moveSavedItemWith,
  restoreManagerTaskWith,
  sweepStaleTasksWith,
} from "./work-sorting";

const OWNER = { ok: true as const, userId: "owner-1", email: "", aal: "aal2" };
type Call = { method: string; path: string; body?: Record<string, unknown> };

function fake(
  rows: Record<string, unknown[]>,
  patchResult?: (path: string, body: Record<string, unknown>) => unknown[],
) {
  const calls: Call[] = [];
  const rest = vi.fn(
    async (_t: string, method: string, path: string, body?: Record<string, unknown>) => {
      calls.push({ method, path, ...(body ? { body } : {}) });
      if (method === "GET") {
        const table = path.split("?")[0]!;
        return { ok: true, data: rows[table] ?? [] };
      }
      if (method === "PATCH")
        return {
          ok: true,
          data: patchResult
            ? patchResult(path, body ?? {})
            : [{ ...(rows[path.split("?")[0]!]?.[0] as object), ...body }],
        };
      return { ok: true, data: {} };
    },
  );
  const deps = { verifyOwner: async () => OWNER, rest } as unknown as WorkbenchDeps;
  return { deps, calls };
}
const task = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  owner_id: "owner-1",
  title: "Old review",
  status: "open",
  result: "",
  worker: "",
  project: "CanX Office",
  waiting_reason: "",
  ...over,
});
const logs = (calls: Call[]) =>
  calls.filter((c) => c.path === "rpc/log_manager_change").map((c) => c.body);

describe("archive_task", () => {
  it("archives with status cancelled, keeps the earlier result, and logs a full rollback point", async () => {
    const { deps, calls } = fake({
      manager_tasks: [task({ status: "waiting", waiting_reason: "John", result: "Draft ready" })],
    });
    const out = await archiveManagerTaskWith(deps, {
      accessToken: "t",
      taskId: "t1",
      reason: "Duplicate of t2",
    });
    expect(out).toMatchObject({ status: "cancelled" });
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.body!["status"]).toBe("cancelled");
    expect(String(patch.body!["result"])).toMatch(
      /^Draft ready\nArchived \d{4}-\d{2}-\d{2}: Duplicate of t2$/,
    );
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(logs(calls)[0]).toMatchObject({
      _action: "task.archive",
      _before: {
        status: "waiting",
        result: "Draft ready",
        waiting_reason: "John",
        project: "CanX Office",
      },
      _after: { status: "cancelled", reason: "Duplicate of t2" },
    });
  });

  it("needs a reason and refuses already finished or archived tasks without writing", async () => {
    for (const [status, reason] of [
      ["open", " "],
      ["cancelled", "x"],
      ["done", "x"],
    ] as const) {
      const { deps, calls } = fake({ manager_tasks: [task({ status })] });
      const out = await archiveManagerTaskWith(deps, { accessToken: "t", taskId: "t1", reason });
      expect(out).toMatchObject({ ok: false });
      expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
    }
  });

  it("refuses another owner's task", async () => {
    const { deps, calls } = fake({ manager_tasks: [task({ owner_id: "someone-else" })] });
    expect(
      await archiveManagerTaskWith(deps, { accessToken: "t", taskId: "t1", reason: "old" }),
    ).toMatchObject({ ok: false, code: "forbidden" });
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
  });
});

describe("restore_task", () => {
  it("restores an archived task to the status saved in its archive rollback point", async () => {
    const { deps, calls } = fake({
      manager_tasks: [task({ status: "cancelled" })],
      manager_changes: [{ before: { status: "waiting", waiting_reason: "Parts on order" } }],
    });
    const out = await restoreManagerTaskWith(deps, { accessToken: "t", taskId: "t1" });
    expect(out).toMatchObject({ restoredTo: "waiting" });
    expect(calls.find((c) => c.method === "PATCH")!.body).toMatchObject({
      status: "waiting",
      waiting_reason: "Parts on order",
    });
    expect(calls.find((c) => c.path.startsWith("manager_changes"))!.path).toContain(
      "action=in.(task.archive,task.cancel)",
    );
    expect(logs(calls)[0]).toMatchObject({
      _action: "task.restore",
      _before: { status: "cancelled" },
    });
  });

  it("falls back to open when no history is found, and refuses tasks that are not archived", async () => {
    const a = fake({ manager_tasks: [task({ status: "done" })] });
    expect(await restoreManagerTaskWith(a.deps, { accessToken: "t", taskId: "t1" })).toMatchObject({
      restoredTo: "open",
    });
    const b = fake({ manager_tasks: [task({ status: "open" })] });
    expect(await restoreManagerTaskWith(b.deps, { accessToken: "t", taskId: "t1" })).toMatchObject({
      ok: false,
    });
    expect(b.calls.filter((c) => c.method !== "GET")).toEqual([]);
  });
});

describe("move_saved_item", () => {
  const link = (over: Record<string, unknown> = {}) => ({
    id: "l1",
    owner_id: "owner-1",
    title: "Vendor quote",
    room: "systems",
    folder: "CanX Projects",
    ...over,
  });

  it("moves a link to another room and logs where it came from", async () => {
    const { deps, calls } = fake({ office_links: [link()] });
    const out = await moveSavedItemWith(deps, {
      accessToken: "t",
      kind: "link",
      itemId: "l1",
      room: "/research",
    });
    expect(out).toEqual({
      title: "Vendor quote",
      from: "systems / CanX Projects",
      to: "research / CanX Projects",
    });
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.path).toBe("office_links?id=eq.l1&owner_id=eq.owner-1");
    expect(patch.body).toEqual({ room: "research" });
    expect(logs(calls)[0]).toMatchObject({
      _action: "link.move",
      _before: { room: "systems", folder: "CanX Projects" },
      _after: { room: "research" },
    });
  });

  it("never moves anything into or out of Finance, and rejects unknown rooms and folders", async () => {
    for (const [row, room, folder] of [
      [link(), "finance", undefined],
      [link({ room: "finance" }), "research", undefined],
      [link(), "nowhere", undefined],
      [link(), "research", "Secret"],
    ] as const) {
      const { deps, calls } = fake({ office_links: [row] });
      expect(
        await moveSavedItemWith(deps, {
          accessToken: "t",
          kind: "link",
          itemId: "l1",
          room,
          folder,
        }),
      ).toMatchObject({ ok: false });
      expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
    }
  });

  it("reports a refused save (for example the same link already filed there) as nothing changed", async () => {
    const { deps, calls } = fake({ office_links: [link()] }, () => []);
    expect(
      await moveSavedItemWith(deps, {
        accessToken: "t",
        kind: "link",
        itemId: "l1",
        room: "research",
      }),
    ).toMatchObject({ ok: false, message: expect.stringContaining("Nothing was changed") });
    expect(logs(calls)).toEqual([]);
  });
});

describe("find_saved_items", () => {
  it("is read-only, strips filter syntax, and skips shelf label notes", async () => {
    const { deps, calls } = fake({
      manager_tasks: [{ id: "t1", title: "Gate", status: "cancelled", project: "" }],
      office_links: [{ id: "l1", title: "Gate quote", room: "research", folder: "CanX Projects" }],
    });
    const out = await findSavedItemsWith(deps, { accessToken: "t", query: "gate),or=(id.neq.x" });
    expect(out).toEqual([
      { kind: "task", id: "t1", title: "Gate", where: "Work Board, cancelled" },
      { kind: "link", id: "l1", title: "Gate quote", where: "research room, folder CanX Projects" },
    ]);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(calls.map((c) => c.path).join(" ")).not.toMatch(/\),or=|id\.neq/);
    expect(calls.find((c) => c.path.startsWith("office_notes"))!.path).toContain(
      encodeURIComponent('"Brain shelf: filing"'),
    );
  });

  it("limits the search to one kind when asked", async () => {
    const { deps, calls } = fake({});
    await findSavedItemsWith(deps, { accessToken: "t", query: "receipt", kind: "file" });
    expect(calls.map((c) => c.path.split("?")[0])).toEqual(["office_files"]);
  });
});

describe("sweep_stale_tasks", () => {
  const NOW = Date.parse("2026-11-01T00:00:00Z");
  const DAY = 24 * 3_600_000;
  const rowsFor = () => ({
    manager_tasks: [
      task({ id: "old", title: "Old job", status: "in_progress", worker: "ChatGPT", updated_at: "2026-10-29T00:25:43+00:00" }),
      task({ id: "fresh", title: "Fresh job", status: "in_progress", updated_at: "2026-10-31T12:00:00+00:00" }),
      task({ id: "other", owner_id: "someone-else", status: "in_progress", updated_at: "2026-10-01T00:00:00+00:00" }),
    ],
  });

  it("moves only this owner's in-progress tasks older than two days to Waiting, with a reason and a rollback point", async () => {
    const { deps, calls } = fake(rowsFor(), (_p, body) => [{ id: "old", ...body }]);
    const out = await sweepStaleTasksWith(deps, { accessToken: "t", now: NOW, stalledAfterMs: 2 * DAY });
    if ("ok" in out) throw new Error(out.message);
    expect(out.moved.map((m) => m.id)).toEqual(["old"]);
    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0]!.path).toContain("status=eq.in_progress");
    expect(patches[0]!.body).toMatchObject({ status: "waiting" });
    expect(String(patches[0]!.body!["waiting_reason"])).toMatch(/no update since Oct 28.*ChatGPT to report back/);
    expect(logs(calls)).toEqual([expect.objectContaining({ _action: "task.update", _entity_id: "old", _before: { status: "in_progress", waiting_reason: "" } })]);
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("preview lists without changing anything", async () => {
    const { deps, calls } = fake(rowsFor());
    const out = await sweepStaleTasksWith(deps, { accessToken: "t", now: NOW, stalledAfterMs: 2 * DAY, preview: true });
    if ("ok" in out) throw new Error(out.message);
    expect(out.moved.map((m) => m.title)).toEqual(["Old job"]);
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("reports a failed save instead of claiming it moved", async () => {
    const { deps } = fake(rowsFor(), () => []);
    const out = await sweepStaleTasksWith(deps, { accessToken: "t", now: NOW, stalledAfterMs: 2 * DAY });
    if ("ok" in out) throw new Error(out.message);
    expect(out.moved).toEqual([]);
    expect(out.failed).toEqual(["Old job"]);
  });
});
