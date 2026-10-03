// Office system health (NOT the personal wellbeing /health room).
// Truth rules: untested is never shown as verified; database/memory connectivity
// or an anonymous HTTP 200 of the login shell never produces a global all-clear.

export type CheckStatus = "untested" | "verified" | "failed";
export type CheckScope = "signed-in-live" | "fixture-render" | "anonymous-shell" | "connectivity";

export interface RoomCheck {
  id: string;
  room: string;
  path: string;
  populatedWith: string;
  mustSee: string;
}

export interface CheckResult {
  checkId: string;
  scope: CheckScope;
  status: CheckStatus;
  at: string; // ISO time
  version: string; // build fingerprint the check ran against
  note?: string;
}

/** Rooms that render saved owner data — each must be opened signed-in after every publish. */
export const POST_PUBLISH_ROOM_CHECKS: RoomCheck[] = [
  { id: "brain-saved-files", room: "Brain", path: "/brain", populatedWith: "saved files", mustSee: "Saved files list shows, each Brain file has its X (Delete) button and hovering shows 'Delete' — do not click it." },
  { id: "finance-receipts", room: "Finance", path: "/finance", populatedWith: "imported receipts", mustSee: "Receipts list and per-currency totals show." },
  { id: "communications-mailboxes", room: "Communications", path: "/communications", populatedWith: "linked mailboxes", mustSee: "Both mailbox addresses show a checked status with time." },
  { id: "work-board-tasks", room: "Work Board", path: "/work-board", populatedWith: "saved tasks", mustSee: "Task cards load with their states." },
  { id: "approvals-requests", room: "Approvals", path: "/approvals", populatedWith: "decision records", mustSee: "Approval list loads without an error page." },
  { id: "records-entries", room: "Records", path: "/records", populatedWith: "saved records", mustSee: "Records load without an error page." },
];

/** Background monitoring: no supported scheduler exists in this Office. Honest, not simulated. */
export const HEALTH_SCHEDULE = {
  configured: false,
  label: "Unscheduled — no background monitor is configured. Checks run only when John runs them.",
  reason: "Signed-in room checks need John's owner sign-in with two-step verification; no unattended job may hold that.",
} as const;

export const NEXT_STEP_ON_FAILURE =
  "Do not mark the update healthy. Note the room and what you saw, ask the Manager for a read-only diagnosis, and if the Office is broken restore the approved recovery point before rebuilding.";

export type GateState =
  | { state: "verified"; label: string }
  | { state: "failed"; label: string; failed: string[] }
  | { state: "untested"; label: string; missing: string[] };

/** Release gate: green only when every room check passed signed-in on the current version. */
export function evaluateReleaseGate(results: CheckResult[], currentVersion: string, checks: RoomCheck[] = POST_PUBLISH_ROOM_CHECKS): GateState {
  const latest = new Map<string, CheckResult>();
  for (const r of results) {
    if (r.scope !== "signed-in-live" || r.version !== currentVersion) continue; // other scopes never count
    const prev = latest.get(r.checkId);
    if (!prev || prev.at < r.at) latest.set(r.checkId, r);
  }
  const failed = checks.filter((c) => latest.get(c.id)?.status === "failed").map((c) => c.room);
  if (failed.length) return { state: "failed", label: `Failed in: ${failed.join(", ")}. ${NEXT_STEP_ON_FAILURE}`, failed };
  const missing = checks.filter((c) => latest.get(c.id)?.status !== "verified").map((c) => c.room);
  if (missing.length) return { state: "untested", label: `Not verified yet on this version: ${missing.join(", ")}.`, missing };
  return { state: "verified", label: `All ${checks.length} rooms opened signed-in with saved data on this version.` };
}

/** Build fingerprint from the loaded entry script (changes on every publish). */
export function currentBuildVersion(doc: Pick<Document, "querySelectorAll"> | undefined = typeof document === "undefined" ? undefined : document): string {
  if (!doc) return "unknown";
  const scripts = Array.from(doc.querySelectorAll("script[src]")) as HTMLScriptElement[];
  const entry = scripts.map((s) => s.getAttribute("src") ?? "").find((s) => /\/assets\/.+\.js$/.test(s));
  return entry ? entry.split("/").pop()! : "unknown";
}

const STORE = "canx-office-health-results-v1";
export function loadResults(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): CheckResult[] {
  try { const v = JSON.parse(storage?.getItem(STORE) ?? "[]"); return Array.isArray(v) ? v.slice(-200) : []; } catch { return []; }
}
export function saveResult(result: CheckResult, storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): CheckResult[] {
  const next = [...loadResults(storage), result].slice(-200); // append-only history, bounded
  storage?.setItem(STORE, JSON.stringify(next));
  return next;
}
