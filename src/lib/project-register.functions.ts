import { createServerFn } from "@tanstack/react-start";
import type { RegisteredProject } from "./project-register";

const tok = (v: unknown) => (typeof (v as { accessToken?: unknown })?.accessToken === "string" ? (v as { accessToken: string }).accessToken.slice(0, 4000) : "");

export type RegisterRest = (path: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; body: unknown }>;

/** Read the register through the owner's token. Notes are owner + two-step only. */
export async function readRegisterWith(rest: RegisterRest) {
  const { PROJECT_IMPORT_SOURCE, PROJECT_CATEGORY_SOURCE, buildRegister } = await import("./project-register");
  const q = `office_notes?select=id,title,detail,source&source=in.(${encodeURIComponent(`"${PROJECT_IMPORT_SOURCE}","${PROJECT_CATEGORY_SOURCE}"`)})&order=created_at.desc&limit=500`;
  const r = await rest(q).catch(() => null);
  if (!r?.ok || !Array.isArray(r.body)) return null;
  return buildRegister(r.body as Array<Record<string, unknown>>);
}

export const getProjectRegister = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => ({ accessToken: tok(v) }))
  .handler(async ({ data }): Promise<{ ok: true; projects: RegisteredProject[]; orphanLabels: number; checkedAt: string } | { ok: false; message: string }> => {
    const b = await import("./canx-backend.server");
    const config = b.readBackendConfig();
    if (!config) return { ok: false, message: b.DENY_MESSAGES.backend_not_configured };
    const owner = await b.verifyOwner(data.accessToken);
    if (!owner.ok) return { ok: false, message: owner.message };
    const reg = await readRegisterWith((p, i) => b.restRequest(config, data.accessToken, p, i));
    if (!reg) return { ok: false, message: "The project register could not be read. Nothing is shown rather than guessing." };
    return { ok: true, ...reg, checkedAt: new Date().toISOString() };
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
