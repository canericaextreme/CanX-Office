/** Stage 1: owner's token, GET-only reads, explicit sources, no provider calls. */
import sharedLogRaw from "../../docs/office-shared-log.json?raw";
import { buildRegister, PROJECT_IMPORT_SOURCE } from "./project-register";
import { locateAll, plansFromRows, PROJECT_PLAN_SOURCE, tasksFromRows } from "./project-locator";
import { parseSharedLog, statusText, type OfficeStatus, type StatusSource } from "./office-status";
import type { OwnerVerification } from "./canx-backend.server";

type Row = Record<string, unknown>;
type ReadResult = { rows: Row[]; source: StatusSource };
export interface OfficeStatusDeps {
  verify: (token: string) => Promise<OwnerVerification>;
  /** A read capability, not a general-purpose executor. */
  read: (path: string) => Promise<{ ok: boolean; status: number; body: unknown }>;
  configured: { anthropic: boolean; github: boolean };
  sharedLogRaw?: string;
  now?: () => Date;
}
export type OfficeStatusReply = { ok: true; status: OfficeStatus } | { ok: false; message: string };
const PAGE = 200;
const MAX_ROWS = 2000;
async function readRows(deps: OfficeStatusDeps, name: string, query: string): Promise<ReadResult> {
  const rows: Row[] = [];
  for (let offset = 0; offset <= MAX_ROWS; offset += PAGE) {
    const r = await deps.read(`${query}&limit=${PAGE}&offset=${offset}`).catch(() => null);
    if (!r?.ok || !Array.isArray(r.body) || !r.body.every(row => row && typeof row === "object" && !Array.isArray(row))) return { rows, source: { name, state: r?.status === 401 || r?.status === 403 ? "denied" : "failed", count: rows.length, truncated: rows.length > 0 } };
    if (offset === MAX_ROWS) return { rows, source: { name, state: "read", count: rows.length, truncated: r.body.length > 0 } };
    rows.push(...r.body as Row[]);
    if (r.body.length < PAGE) return { rows, source: { name, state: "read", count: rows.length, truncated: false } };
  }
  throw new Error("Unreachable bounded reader");
}
export async function readOfficeStatusWith(deps: OfficeStatusDeps, token: string): Promise<OfficeStatusReply> {
  const who = await deps.verify(token).catch(() => null);
  if (!who?.ok) return { ok: false, message: who && !who.ok ? who.message : "Office owner access could not be verified." };
  const checkedAt = (deps.now?.() ?? new Date()).toISOString();
  const sourcesFilter = encodeURIComponent(`"${PROJECT_IMPORT_SOURCE}","${PROJECT_PLAN_SOURCE}"`);
  const [register, tasks] = await Promise.all([
    readRows(deps, "Saved project register and plans", `office_notes?select=id,title,detail,source&source=in.(${sourcesFilter})&order=created_at.desc,id.asc`),
    // No title, description, instructions or result: tasks may refer to private material.
    readRows(deps, "Work Board task metadata", "manager_tasks?select=id,status,project,updated_at&order=updated_at.desc,id.asc"),
  ]);
  const entries = parseSharedLog(deps.sharedLogRaw ?? sharedLogRaw);
  const logSource: StatusSource = { name: "docs/office-shared-log.json", state: entries ? "read" : "failed", count: entries?.length ?? 0, truncated: (entries?.length ?? 0) > 100 };
  const sources = [register.source, tasks.source, logSource];
  const projects = buildRegister(register.rows).projects;
  const locators = locateAll(projects, plansFromRows(register.rows), tasks.source.state === "read" && !tasks.source.truncated ? tasksFromRows(tasks.rows) : null);
  const knownProblems = (entries ?? []).filter(e => e.kind === "problem").slice(0, 20).map(e => e.summary);
  for (const source of sources) {
    if (source.state !== "read") knownProblems.push(`${source.name} was ${source.state}; missing data is not an empty Office.`);
    if (source.truncated) knownProblems.push(`${source.name} is incomplete; additional records may exist.`);
  }
  const safeIds = new Set(projects.map(p => p.projectId));
  const openTasks = tasks.rows.filter(t => !["done", "completed", "cancelled"].includes(String(t["status"]))).map(t => ({
    id: statusText(t["id"], 60), projectId: safeIds.has(String(t["project"])) ? String(t["project"]) : null,
    status: ["open", "in_progress", "waiting"].includes(String(t["status"])) ? String(t["status"]) : "unknown",
    updatedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(t["updated_at"])) ? statusText(t["updated_at"], 40) : null,
  }));
  const waitingCount = openTasks.filter(t => t.status === "waiting").length;
  if (waitingCount) knownProblems.push(`${waitingCount} readable Work Board task(s) are waiting. Private task text is withheld.`);
  return { ok: true, status: {
    version: 1, checkedAt, complete: sources.every(s => s.state === "read" && !s.truncated),
    projects: locators.map(l => ({ id: l.project.projectId, name: statusText(l.project.name, 160), stage: l.stage, stageBasis: statusText(l.stageBasis, 300), updatedAt: l.latestActivity && /^\d{4}-\d{2}-\d{2}T/.test(l.latestActivity) ? statusText(l.latestActivity, 40) : null })),
    sharedLog: (entries ?? []).slice(0, 100), recentDecisions: (entries ?? []).filter(e => e.kind === "decision").slice(0, 20), openTasks,
    knownProblems,
    tools: [
      { name: "Supabase", state: register.source.state === "read" && tasks.source.state === "read" ? "read-verified" : "configured-unverified", detail: "Owner-token reads of the listed sources only; this is not whole-office health verification." },
      { name: "Google AI", state: "unknown", detail: "No Google AI connection probe exists in this status source. Google Drive is a separate integration." },
      { name: "Anthropic", state: deps.configured.anthropic ? "configured-unverified" : "not-configured-here", detail: "Server configuration presence only. This read does not call Anthropic, check expiry or establish provider health." },
      { name: "GitHub", state: deps.configured.github ? "configured-unverified" : "not-configured-here", detail: "Server build-connector configuration presence only. Repository settings and live access are not probed." },
    ], sources,
    privacy: "Operational metadata and explicitly shared log summaries only. No project descriptions, plan instructions, task titles or bodies, journals, photos, book contents, Finance records, file URLs or credentials. No AI request or build is started.",
  } };
}
