import { describe, expect, it } from "vitest";
import { buildRegister, parseProjectRecord, registerForModel, countProjectCategories, PROJECT_IMPORT_SOURCE, PROJECT_CATEGORY_SOURCE } from "./project-register";
import { readRegisterWith } from "./project-register.functions";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rec = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `lovable-project:${uuid(n)}`, title: `P${n}`, source: PROJECT_IMPORT_SOURCE,
  detail: JSON.stringify({ version: 1, provider: "Lovable", projectId: uuid(n), workspaceId: "w", name: `P${n}`, category: "Highway Safety", categoryBasis: "Suggested", room: "/projects", editorUrl: `https://lovable.dev/projects/${uuid(n)}`, previewUrl: `https://id-preview--${uuid(n)}.lovable.app`, liveUrl: null, published: true, latestCommit: "b683f4c9", githubUrl: null, checkedAt: null, health: "Not tested", liveDataAccess: "Not connected", sourceCheckedOn: "2026-10-03", ...extra }),
});

describe("project register", () => {
  it("reads 15 saved records and keeps same-named projects distinct", () => {
    const rows = Array.from({ length: 15 }, (_, i) => rec(i + 1, i < 2 ? { name: "Safe Highways" } : {}));
    const { projects } = buildRegister(rows);
    expect(projects).toHaveLength(15);
    expect(projects.filter((p) => p.name === "Safe Highways").map((p) => p.projectId)).toEqual([uuid(1), uuid(2)]);
  });
  it("treats unknown live URL / GitHub honestly", () => {
    const p = parseProjectRecord(rec(3))!;
    expect(p.liveUrl).toBeNull(); expect(p.githubUrl).toBeNull();
    expect(registerForModel([p], "read")).toContain("live link unknown");
    expect(registerForModel([p], "read")).toContain("never claim");
  });
  it("does not open links for unknown providers or bad detail", () => {
    const p = parseProjectRecord(rec(4, { provider: "Other", editorUrl: "https://evil.example" }))!;
    expect(p.editorUrl).toBeNull(); expect(p.issues.join()).toMatch(/not recognised/);
    const bad = parseProjectRecord({ id: `lovable-project:${uuid(5)}`, title: "x", detail: "{oops", source: PROJECT_IMPORT_SOURCE })!;
    expect(bad.projectId).toBe(uuid(5)); expect(bad.issues.length).toBeGreaterThan(0);
    expect(parseProjectRecord({ id: "x", detail: "{}", source: "other" })).toBeNull();
  });
  it("applies a saved category label on reload while keeping imported metadata", () => {
    const base = rec(6);
    const { projects } = buildRegister([{ id: "pcat", title: uuid(6), detail: "Wellbeing", source: PROJECT_CATEGORY_SOURCE }, base]);
    expect(projects[0]).toMatchObject({ category: "Wellbeing", categoryManual: true, importedCategory: "Highway Safety", latestCommit: "b683f4c9", published: true });
    expect(base.detail).toContain("Highway Safety");
    expect(countProjectCategories(projects)).toEqual({ Wellbeing: 1 });
  });
  it("ignores invalid labels", () => {
    expect(buildRegister([{ title: uuid(7), detail: "Hacked", source: PROJECT_CATEGORY_SOURCE }, rec(7)]).projects[0]!.category).toBe("Highway Safety");
  });
  it("reports read failure as null and denied/failed honestly to Elsie", async () => {
    expect(await readRegisterWith(async () => ({ ok: false, status: 401, body: null }))).toBeNull();
    expect(await readRegisterWith(async () => { throw new Error("net"); })).toBeNull();
    expect((await readRegisterWith(async () => ({ ok: true, status: 200, body: [rec(8)] })))!.projects).toHaveLength(1);
    expect(registerForModel([], "failed")).toMatch(/could NOT be read/);
    expect(registerForModel([], "denied")).toMatch(/two-step/);
  });
});
