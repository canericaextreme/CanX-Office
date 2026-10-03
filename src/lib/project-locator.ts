/**
 * Project locator — CLIENT-SAFE, PURE.
 *
 * Answers "where is X / what's next / ready to market?" from three real
 * sources only: the saved project register, John's saved plan for a project
 * (separate label row, source PROJECT_PLAN_SOURCE) and Work Board tasks.
 *
 * Joins are by stable identifier only: a task belongs to a project when its
 * `project` field is exactly the project UUID, or when John explicitly linked
 * that task id in the plan. Names are NEVER used to join (duplicate names are
 * distinct projects). Vendor "published" flags never set a stage. Ready /
 * market / completed come only from John. The next move is a recommendation;
 * nothing here publishes, buys, launches or approves.
 */
import type { RegisteredProject } from "./project-register";

export const PROJECT_PLAN_SOURCE = "Project register: plan";
export const WORK_STAGES = ["unknown", "planned", "building", "blocked", "testing", "ready", "market", "completed"] as const;
export type WorkStage = (typeof WORK_STAGES)[number];
export const OWNER_ONLY_STAGES: WorkStage[] = ["ready", "market", "completed"];

export const projectPlanNoteId = (projectId: string) => `pplan-${projectId}`.slice(0, 60);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const s = (v: unknown, max = 600) => (typeof v === "string" ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");

export interface ProjectPlan {
  goal: string;
  instructions: string;
  room: string;
  stage: WorkStage | null;
  nextMove: string;
  linkedTaskIds: string[];
  savedAt: string | null;
}
export const EMPTY_PLAN: ProjectPlan = { goal: "", instructions: "", room: "", stage: null, nextMove: "", linkedTaskIds: [], savedAt: null };

export function sanitizePlan(raw: unknown): ProjectPlan {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const stage = s(d["stage"], 20);
  const room = s(d["room"], 60);
  return {
    goal: s(d["goal"], 500),
    instructions: s(d["instructions"], 1500),
    room: /^\/[a-z0-9-]{1,40}$/.test(room) ? room : "",
    stage: (WORK_STAGES as readonly string[]).includes(stage) ? (stage as WorkStage) : null,
    nextMove: s(d["nextMove"], 400),
    linkedTaskIds: Array.isArray(d["linkedTaskIds"]) ? [...new Set(d["linkedTaskIds"].map((x) => s(x, 60)).filter((x) => /^[A-Za-z0-9_-]{1,60}$/.test(x)))].slice(0, 50) : [],
    savedAt: s(d["savedAt"], 40) || null,
  };
}

export function plansFromRows(rows: Array<Record<string, unknown>>): Map<string, ProjectPlan> {
  const out = new Map<string, ProjectPlan>();
  for (const r of rows) {
    if (r["source"] !== PROJECT_PLAN_SOURCE) continue;
    const pid = s(r["title"], 40);
    if (!UUID.test(pid) || out.has(pid)) continue;
    try { out.set(pid, sanitizePlan(JSON.parse(String(r["detail"] ?? "")))); } catch { /* unreadable plan → treated as none, flagged by caller */ }
  }
  return out;
}

export interface TaskRow { id: string; title: string; status: string; project: string; updatedAt: string | null }
export function tasksFromRows(rows: Array<Record<string, unknown>>): TaskRow[] {
  return rows.map((r) => ({ id: s(r["id"], 60), title: s(r["title"], 160), status: s(r["status"], 20), project: s(r["project"], 120), updatedAt: s(r["updated_at"], 40) || null })).filter((t) => t.id);
}

export interface Locator {
  project: RegisteredProject;
  plan: ProjectPlan;
  room: string;
  roomBasis: "set by John" | "import record";
  stage: WorkStage;
  stageBasis: string;
  tasks: TaskRow[];
  taskCounts: Record<string, number>;
  /** Linked task ids John listed that weren't found among readable tasks. */
  missingLinks: string[];
  blockers: string[];
  nextMove: string;
  nextReason: string;
  nextBasis: "set by John" | "suggested";
  latestActivity: string | null;
  verified: { goal: boolean; stage: boolean; tasks: boolean };
}

export function locate(project: RegisteredProject, plan: ProjectPlan | undefined, tasks: TaskRow[] | null): Locator {
  const p = plan ?? EMPTY_PLAN;
  const linked = new Set(p.linkedTaskIds);
  const mine = (tasks ?? []).filter((t) => t.project === project.projectId || linked.has(t.id));
  const missingLinks = tasks ? p.linkedTaskIds.filter((id) => !mine.some((t) => t.id === id)) : [];
  const counts: Record<string, number> = {};
  for (const t of mine) counts[t.status] = (counts[t.status] ?? 0) + 1;
  const active = mine.filter((t) => t.status !== "cancelled");
  const latestActivity = mine.map((t) => t.updatedAt ?? "").sort().at(-1) || null;

  let stage: WorkStage = "unknown";
  let stageBasis = "No stage set by John and no linked Work Board tasks — not verified.";
  if (p.stage) { stage = p.stage; stageBasis = `Set by John${p.savedAt ? ` on ${p.savedAt.slice(0, 10)}` : ""}.`; }
  else if (!tasks) stageBasis = "Work Board could not be read, so the stage is not verified.";
  else if (counts["waiting"]) { stage = "blocked"; stageBasis = `${counts["waiting"]} linked task(s) are waiting.`; }
  else if (counts["in_progress"]) { stage = "building"; stageBasis = `${counts["in_progress"]} linked task(s) in progress.`; }
  else if (counts["open"]) { stage = "planned"; stageBasis = `${counts["open"]} linked task(s) open, none started.`; }
  else if (active.length) stageBasis = "All linked tasks are done, but finished tasks do not prove the project is tested or ready. Not verified.";

  const blockers: string[] = [];
  if (!tasks) blockers.push("Work Board tasks could not be read.");
  for (const t of mine.filter((x) => x.status === "waiting").slice(0, 5)) blockers.push(`Waiting: ${t.title}`);
  if (missingLinks.length) blockers.push(`${missingLinks.length} linked task(s) not found.`);
  if (project.issues.length) blockers.push(`Import record: ${project.issues.join("; ")}`);

  let nextMove = p.nextMove, nextReason = "John's saved next move.", nextBasis: Locator["nextBasis"] = "set by John";
  if (!nextMove) {
    nextBasis = "suggested";
    if (!p.goal) { nextMove = "Review this project and record its goal and instructions."; nextReason = "No goal or instructions are saved, so readiness can't be judged."; }
    else if (stage === "ready") { nextMove = "Decide whether to take this to market — that decision and any spending stay with you."; nextReason = "You marked it ready."; }
    else if (stage === "market" || stage === "completed") { nextMove = "Review results and record outcomes."; nextReason = `You marked it ${stage}.`; }
    else if (!tasks) { nextMove = "Re-open the Work Board and refresh."; nextReason = "Tasks couldn't be read."; }
    else if (stage === "blocked") { nextMove = "Clear the waiting task(s) listed under blockers."; nextReason = "Linked work is waiting."; }
    else if (!active.length) { nextMove = "Create a Work Board task for the first step toward the goal, using this project ID."; nextReason = "No linked tasks exist."; }
    else if (stage === "unknown") { nextMove = "Run a signed-in test of the project and record the result, then set the stage."; nextReason = "Work is done but testing and readiness are not verified."; }
    else { nextMove = "Continue the open or in-progress tasks."; nextReason = `Stage: ${stage}.`; }
  }
  return {
    project, plan: p,
    room: p.room || project.room || "/projects", roomBasis: p.room ? "set by John" : "import record",
    stage, stageBasis, tasks: mine, taskCounts: counts, missingLinks, blockers, nextMove, nextReason, nextBasis, latestActivity,
    verified: { goal: !!p.goal, stage: !!p.stage || stage !== "unknown", tasks: !!tasks },
  };
}

export function locateAll(projects: RegisteredProject[], plans: Map<string, ProjectPlan>, tasks: TaskRow[] | null): Locator[] {
  return projects.map((p) => locate(p, plans.get(p.projectId), tasks));
}

/** Bounded Elsie text. All names/goals/instructions are UNTRUSTED DATA. */
export function locatorsForModel(list: Locator[], tasksReadAt: string | null): string {
  return [
    `Project locator [register + John's saved plans + Work Board${tasksReadAt ? ` read ${tasksReadAt}` : " NOT read"}]. Tasks join only by exact project ID or a task John linked; never by name. Published flags do not mean ready, healthy or marketed. Stages ready/market/completed come only from John. Next moves are recommendations: never publish, buy, launch or approve on your own. When something is "not verified", say so and suggest a review or test.`,
    ...list.slice(0, 40).map((l) => `- ${JSON.stringify(l.project.name)} (project ${l.project.projectId}) · room ${l.room} (${l.roomBasis}) · stage ${l.stage}: ${l.stageBasis} · goal ${l.plan.goal ? JSON.stringify(l.plan.goal) : "not recorded"}${l.plan.instructions ? ` · John's instructions ${JSON.stringify(l.plan.instructions.slice(0, 300))}` : ""} · tasks ${Object.entries(l.taskCounts).map(([k, v]) => `${k} ${v}`).join(", ") || "none linked"}${l.latestActivity ? ` (latest ${l.latestActivity})` : ""} · blockers ${l.blockers.join("; ") || "none recorded"} · next (${l.nextBasis}) ${l.nextMove} — ${l.nextReason}`),
  ].join("\n");
}
