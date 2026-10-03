import { describe, expect, it } from "vitest";
import { parseProjectRecord, PROJECT_IMPORT_SOURCE } from "./project-register";
import { locate, locateAll, locatorsForModel, plansFromRows, sanitizePlan, tasksFromRows, PROJECT_PLAN_SOURCE } from "./project-locator";
import { readLocatorsWith } from "./project-register.functions";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const imp = (n: number, name = `P${n}`) => ({ id: `lovable-project:${uuid(n)}`, title: name, source: PROJECT_IMPORT_SOURCE, detail: JSON.stringify({ version: 1, provider: "Lovable", projectId: uuid(n), name, category: "Highway Safety", room: "/projects", published: true, health: "Not tested", liveDataAccess: "Not connected", sourceCheckedOn: "2026-10-03" }) });
const proj = (n: number, name?: string) => parseProjectRecord(imp(n, name))!;
const task = (id: string, status: string, project: string, title = id) => ({ id, title, status, project, updated_at: "2026-10-03T10:00:00Z" });

describe("project locator", () => {
  it("published flag alone gives stage unknown and a review suggestion", () => {
    const l = locate(proj(1), undefined, []);
    expect(l.stage).toBe("unknown");
    expect(l.stageBasis).toMatch(/not verified/i);
    expect(l.nextMove).toMatch(/record its goal/);
    expect(l.nextBasis).toBe("suggested");
  });
  it("joins tasks only by exact project id or explicit link, never by duplicate name", () => {
    const a = proj(1, "Safe Highways"), b = proj(2, "Safe Highways");
    const tasks = tasksFromRows([task("t1", "in_progress", uuid(1)), task("t2", "open", "Safe Highways"), task("t3", "waiting", "x")]);
    const plans = plansFromRows([{ source: PROJECT_PLAN_SOURCE, title: uuid(2), detail: JSON.stringify({ goal: "g", linkedTaskIds: ["t3", "gone"] }) }]);
    const [la, lb] = locateAll([a, b], plans, tasks);
    expect(la!.tasks.map((t) => t.id)).toEqual(["t1"]);
    expect(la!.stage).toBe("building");
    expect(lb!.tasks.map((t) => t.id)).toEqual(["t3"]);
    expect(lb!.stage).toBe("blocked");
    expect(lb!.missingLinks).toEqual(["gone"]);
  });
  it("done tasks never imply ready; ready/market only from John", () => {
    const done = locate(proj(3), sanitizePlan({ goal: "ship" }), tasksFromRows([task("t", "done", uuid(3))]));
    expect(done.stage).toBe("unknown");
    expect(done.nextMove).toMatch(/signed-in test/);
    const john = locate(proj(3), sanitizePlan({ goal: "ship", stage: "ready", savedAt: "2026-10-03T00:00:00Z" }), []);
    expect(john.stage).toBe("ready");
    expect(john.nextMove).toMatch(/decision and any spending stay with you/);
  });
  it("unreadable tasks are reported, not guessed", () => {
    const l = locate(proj(4), sanitizePlan({ goal: "g" }), null);
    expect(l.stage).toBe("unknown"); expect(l.blockers[0]).toMatch(/could not be read/); expect(l.verified.tasks).toBe(false);
  });
  it("sanitises plans and keeps John's room/next move", () => {
    const p = sanitizePlan({ stage: "launched", room: "javascript:x", linkedTaskIds: ["ok", "bad id!"], nextMove: "Test on phone" });
    expect(p.stage).toBeNull(); expect(p.room).toBe(""); expect(p.linkedTaskIds).toEqual(["ok"]);
    const l = locate(proj(5), sanitizePlan({ room: "/safe-highways", nextMove: "Test on phone" }), []);
    expect(l.room).toBe("/safe-highways"); expect(l.roomBasis).toBe("set by John"); expect(l.nextBasis).toBe("set by John");
  });
  it("Elsie text carries ids, guardrails and not-verified wording", () => {
    const txt = locatorsForModel([locate(proj(6), undefined, null)], null);
    expect(txt).toContain(uuid(6)); expect(txt).toMatch(/never by name/); expect(txt).toMatch(/NOT read/); expect(txt).toMatch(/goal not recorded/);
  });
  it("readLocatorsWith keeps register when tasks fail and saved plans survive reload", async () => {
    const plan = { source: PROJECT_PLAN_SOURCE, title: uuid(7), detail: JSON.stringify({ goal: "g", stage: "testing" }) };
    const res = await readLocatorsWith(async (path) => path.startsWith("manager_tasks") ? { ok: false, status: 500, body: null } : { ok: true, status: 200, body: [plan, imp(7)] });
    expect(res!.tasksReadAt).toBeNull();
    expect(res!.locators[0]).toMatchObject({ stage: "testing", plan: { goal: "g" } });
    expect(res!.locators[0]!.project.importedCategory).toBe("Highway Safety");
    expect(await readLocatorsWith(async () => ({ ok: false, status: 401, body: null }))).toBeNull();
  });
});
