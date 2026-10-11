import { createServerFn } from "@tanstack/react-start";
import type { RegisteredProject } from "./project-register";
import type { Locator } from "./project-locator";

const tok = (v: unknown) => (typeof (v as { accessToken?: unknown })?.accessToken === "string" ? (v as { accessToken: string }).accessToken.slice(0, 4000) : "");

export type RegisterRest = (path: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; body: unknown }>;

/** Read the register through the owner's token. Notes are owner + two-step only. */
export async function readRegisterWith(rest: RegisterRest) {
  const { PROJECT_IMPORT_SOURCE, PROJECT_CATEGORY_SOURCE, buildRegister } = await import("./project-register");
  const { PROJECT_PLAN_SOURCE, plansFromRows } = await import("./project-locator");
  const q = `office_notes?select=id,title,detail,source&source=in.(${encodeURIComponent(`"${PROJECT_IMPORT_SOURCE}","${PROJECT_CATEGORY_SOURCE}","${PROJECT_PLAN_SOURCE}"`)})&order=created_at.desc&limit=500`;
  const r = await rest(q).catch(() => null);
  if (!r?.ok || !Array.isArray(r.body)) return null;
  const rows = r.body as Array<Record<string, unknown>>;
  return { ...buildRegister(rows), plans: plansFromRows(rows) };
}

/** Register + plans + fresh Work Board tasks → locators. Tasks failing is reported, not hidden. */
export async function readLocatorsWith(rest: RegisterRest): Promise<{ locators: Locator[]; tasksReadAt: string | null } | null> {
  const reg = await readRegisterWith(rest);
  if (!reg) return null;
  const { locateAll, tasksFromRows } = await import("./project-locator");
  const t = await rest("manager_tasks?select=id,title,status,project,updated_at&order=updated_at.desc&limit=500").catch(() => null);
  const tasks = t?.ok && Array.isArray(t.body) ? tasksFromRows(t.body as Array<Record<string, unknown>>) : null;
  return { locators: locateAll(reg.projects, reg.plans, tasks), tasksReadAt: tasks ? new Date().toISOString() : null };
}

export const getProjectRegister = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => ({ accessToken: tok(v) }))
  .handler(async ({ data }): Promise<{ ok: true; projects: RegisteredProject[]; locators: Locator[]; tasksReadAt: string | null; orphanLabels: number; checkedAt: string } | { ok: false; message: string }> => {
    const b = await import("./canx-backend.server");
    const config = b.readBackendConfig();
    if (!config) return { ok: false, message: b.DENY_MESSAGES.backend_not_configured };
    const owner = await (await import("./canx-viewer.server")).verifyOwnerOrViewerRead(data.accessToken);
    if (!owner.ok) return { ok: false, message: owner.message };
    const rest: RegisterRest = (p, i) => b.restRequest(config, data.accessToken, p, i);
    const reg = await readRegisterWith(rest);
    const loc = reg ? await readLocatorsWith(rest) : null;
    if (!reg || !loc) return { ok: false, message: "The project register could not be read. Nothing is shown rather than guessing." };
    return { ok: true, projects: reg.projects, orphanLabels: reg.orphanLabels, locators: loc.locators, tasksReadAt: loc.tasksReadAt, checkedAt: new Date().toISOString() };
  });

/** Re-file one project. Writes a separate label; the import record is never changed. */
export const setProjectCategory = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    const raw = (v ?? {}) as { projectId?: unknown; category?: unknown };
    return { accessToken: tok(v), projectId: typeof raw.projectId === "string" ? raw.projectId.slice(0, 40) : "", category: typeof raw.category === "string" ? raw.category.slice(0, 60) : "" };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const pr = await import("./project-register");
    if (!/^[0-9a-f-]{36}$/i.test(data.projectId) || !(pr.PROJECT_CATEGORIES as readonly string[]).includes(data.category)) return { ok: false, message: "That project or category isn't recognised. Nothing was changed." };
    const b = await import("./canx-backend.server");
    const config = b.readBackendConfig();
    if (!config) return { ok: false, message: b.DENY_MESSAGES.backend_not_configured };
    const owner = await b.verifyOwner(data.accessToken);
    if (!owner.ok) return { ok: false, message: owner.message };
    const rest = (p: string, i?: RequestInit) => b.restRequest(config, data.accessToken, p, i);
    // The project must exist in the owner's saved register.
    const reg = await readRegisterWith(rest);
    if (!reg) return { ok: false, message: "The project register could not be read, so nothing was changed." };
    if (!reg.projects.some((p) => p.projectId === data.projectId)) return { ok: false, message: "That project isn't in your saved register. Nothing was changed." };
    const id = pr.projectCategoryNoteId(data.projectId);
    const row = { id, owner_id: owner.userId, kind: "decision", title: data.projectId, detail: data.category, owner_name: "John", provenance: "john", source: pr.PROJECT_CATEGORY_SOURCE, created_at: new Date().toISOString() };
    const saved = await rest("office_notes?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([row]) });
    if (!saved.ok) return { ok: false, message: "The category was not saved. Nothing else changed." };
    const after = await readRegisterWith(rest);
    const p = after?.projects.find((x) => x.projectId === data.projectId);
    if (!p || p.category !== data.category) return { ok: false, message: "The category could not be confirmed on re-read. Please check again before relying on it." };
    await rest("office_audit", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ owner_id: owner.userId, action: "projects.categorise", entity: "office_notes", entity_id: id, detail: { projectId: data.projectId, category: data.category } }) }).catch(() => null);
    return { ok: true, message: `Filed ${p.name} under ${data.category} and confirmed. The imported record was not changed.` };
  });

/** Save John's goal/instructions/room/stage/next move for one project. Separate label row; import record untouched. */
export const setProjectPlan = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    const raw = (v ?? {}) as { projectId?: unknown; plan?: unknown };
    return { accessToken: tok(v), projectId: typeof raw.projectId === "string" ? raw.projectId.slice(0, 40) : "", plan: raw.plan };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const { sanitizePlan, projectPlanNoteId, PROJECT_PLAN_SOURCE } = await import("./project-locator");
    if (!/^[0-9a-f-]{36}$/i.test(data.projectId)) return { ok: false, message: "That project isn't recognised. Nothing was changed." };
    const plan = { ...sanitizePlan(data.plan), savedAt: new Date().toISOString() };
    const b = await import("./canx-backend.server");
    const config = b.readBackendConfig();
    if (!config) return { ok: false, message: b.DENY_MESSAGES.backend_not_configured };
    const owner = await b.verifyOwner(data.accessToken);
    if (!owner.ok) return { ok: false, message: owner.message };
    const rest: RegisterRest = (p, i) => b.restRequest(config, data.accessToken, p, i);
    const reg = await readRegisterWith(rest);
    if (!reg) return { ok: false, message: "The project register could not be read, so nothing was changed." };
    const proj = reg.projects.find((p) => p.projectId === data.projectId);
    if (!proj) return { ok: false, message: "That project isn't in your saved register. Nothing was changed." };
    const id = projectPlanNoteId(data.projectId);
    const row = { id, owner_id: owner.userId, kind: "decision", title: data.projectId, detail: JSON.stringify(plan), owner_name: "John", provenance: "john", source: PROJECT_PLAN_SOURCE, created_at: plan.savedAt };
    const saved = await rest("office_notes?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([row]) });
    if (!saved.ok) return { ok: false, message: "The plan was not saved. Nothing else changed." };
    const after = await readRegisterWith(rest);
    const got = after?.plans.get(data.projectId);
    if (!got || got.savedAt !== plan.savedAt || got.goal !== plan.goal || got.stage !== plan.stage || got.nextMove !== plan.nextMove || got.room !== plan.room) return { ok: false, message: "The plan could not be confirmed on re-read. Please check again before relying on it." };
    await rest("office_audit", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ owner_id: owner.userId, action: "projects.plan", entity: "office_notes", entity_id: id, detail: { projectId: data.projectId, stage: plan.stage } }) }).catch(() => null);
    return { ok: true, message: `Saved and confirmed the plan for ${proj.name}. The imported record and category were not changed.` };
  });
