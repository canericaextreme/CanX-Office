/**
 * Handing a job from Elsie's small GitHub builder to a full Claude worker
 * (21 Oct 2026). John: "build it so it's a smooth handoff to you, and she can
 * see that it succeeds the first go around."
 *
 * The small builder has ~30 steps, no shell and US$2 per run; 4 of 6 Claude
 * builds before 21 Oct failed on bigger jobs. A full Claude session (Claude
 * Code with tests, a PR and the merge robot) picks up handed-over jobs on a
 * schedule and reports progress in one Brain note per task, which Elsie reads.
 *
 * Two records, two writers, no shared edits:
 *  - the task's evidence gets `[claude-takeover <iso> <reason>]` (Elsie's server only);
 *  - office_notes `claude-takeover-<taskId>` is created by Elsie with STATE: waiting
 *    and afterwards updated only by the Claude worker (versioned connector writes).
 * Pure: no network, no storage.
 */

export type TakeoverReason = "upfront" | "after-failure" | "asked";
export type TakeoverState = "waiting" | "taken" | "working" | "pr-open" | "merged" | "live" | "blocked";

export const TAKEOVER_NOTE_PREFIX = "claude-takeover-";
export const takeoverNoteId = (taskId: string): string => TAKEOVER_NOTE_PREFIX + taskId;
export const takeoverMarker = (at: string, reason: TakeoverReason): string => `[claude-takeover ${at} ${reason}]`;
const MARKER = /\[claude-takeover ([0-9T:.\-]+Z) (upfront|after-failure|asked)\]/;
export const hasTakeover = (evidence: string | null | undefined): boolean => MARKER.test(evidence ?? "");

/** Run results that mean the small builder did not produce a change. */
export const FAILED_RUN_STATES: ReadonlySet<string> = new Set(["failure", "cancelled", "timed_out", "startup_failure"]);

/** John asked for the full worker in words ("full Claude", "Claude Code", "a Claude session"). */
const ASKS_FOR_FULL = /\b(?:full|real|proper|big)\s+claude\b|\bclaude\s+(?:code|worker|session|thread)\b|\b(?:hand|give|pass|send)\s+(?:it|this|that|the (?:job|task))\s+(?:over\s+)?to\s+(?:a\s+)?(?:full\s+)?claude\s+(?:properly|directly|yourself)\b/i;
/** Wording that usually means more than one small screen edit. */
const BIG_JOB = /\b(?:redesign|rebuild|overhaul|new (?:room|page|panel|tab|screen|feature|section)|(?:add|move|create|build) (?:a |the )?(?:\w+ ){0,3}(?:tab|panel|room|page) (?:at|to|in|on|beside|next to)|navigation|every room|all (?:the )?rooms|several rooms|across the (?:office|rooms)|chat (?:panel|tab|window)|like chatgpt|chatgpt[- ]style)\b/i;
const CHANGE_WORD = /\b(?:add|remove|delete|move|change|rename|replace|make|put|update|fix|repair|create|build|redesign|hide|show)\b/gi;

/**
 * Whether a Claude-named job should skip the small builder and go straight to a
 * full Claude worker. Errs towards the small builder for one-line screen edits.
 */
export function needsFullClaude(request: string): boolean {
  const text = request.trim();
  if (ASKS_FOR_FULL.test(text)) return true;
  if (text.length > 700) return true;
  if (BIG_JOB.test(text)) return true;
  return (text.match(CHANGE_WORD)?.length ?? 0) >= 4;
}

/** Elsie hands an existing task over only when John's current words ask Claude to take it. */
export function claudeTakeoverRefusal(request: string): string | null {
  const text = request.trim();
  if (!/\bclaude\b/i.test(text)) return "John's current request does not name Claude, so the task was not handed over.";
  if (/\bcodex\b/i.test(text) && !/\bclaude[ -]only\b|\bonly claude\b/i.test(text)) return "The request names both Claude and Codex. Say which one; nothing was handed over.";
  if (!/\b(?:hand|give|pass|send|let|have|ask|get|take|move|assign|put|do|finish|build|fix|take over|over to)\b/i.test(text)) return "No request to hand the task to Claude was heard; nothing was handed over.";
  return null;
}

export interface TakeoverNote { state: TakeoverState; link?: string; pr?: number; note?: string; updated?: string }

const STATES: readonly TakeoverState[] = ["waiting", "taken", "working", "pr-open", "merged", "live", "blocked"];
const field = (detail: string, name: string) => new RegExp(`(?:^|\\|)\\s*${name}:\\s*([^|\\n]+)`, "i").exec(detail)?.[1]?.trim();

/** Reads the first line of a takeover note: `STATE: pr-open | LINK: … | PR: 204 | UPDATED: … | NOTE: …`. */
export function parseTakeoverNote(detail: string | null | undefined): TakeoverNote | null {
  const text = (detail ?? "").split("\n")[0] ?? "";
  const raw = field(text, "STATE")?.toLowerCase();
  const state = STATES.find(s => s === raw);
  if (!state) return null;
  const link = field(text, "LINK");
  const pr = Number(field(text, "PR")?.replace(/^#/, ""));
  const note = field(text, "NOTE");
  const updated = field(text, "UPDATED");
  return {
    state,
    ...(link && /^https:\/\/(?:claude\.ai|github\.com)\//.test(link) ? { link } : {}),
    ...(Number.isSafeInteger(pr) && pr > 0 ? { pr } : {}),
    ...(note ? { note: note.slice(0, 300) } : {}),
    ...(updated ? { updated: updated.slice(0, 40) } : {}),
  };
}

/** The first note Elsie writes when she hands a task over. */
export function newTakeoverNoteDetail(input: { taskId: string; reason: TakeoverReason; at: string; title: string; detail: string; failedRun?: string }): string {
  const why = input.reason === "after-failure" ? `small builder failed${input.failedRun ? ` (${input.failedRun})` : ""}`
    : input.reason === "upfront" ? "too big for the small builder" : "John asked for Claude";
  return [
    `STATE: waiting | TASK: ${input.taskId} | REASON: ${why} | UPDATED: ${input.at}`,
    "For the Claude worker: claim this by updating line 1 to STATE: taken | LINK: <your session link>, then working, pr-open (PR: n), merged, live, or blocked (NOTE: what John must decide). Keep later lines.",
    `JOB: ${input.title.trim()}`,
    input.detail.trim(),
  ].join("\n").slice(0, 3900);
}

export interface ChangeState { state: "open" | "draft" | "merged" | "closed"; url: string }

/** What Elsie tells John. A live PR read, when there is one, wins over the saved note. */
export function takeoverStatusText(note: TakeoverNote | null, change?: ChangeState | null): string {
  const link = note?.link ? ` Claude's session: ${note.link}.` : "";
  if (change?.state === "merged" && note?.state !== "live")
    return `A full Claude worker finished this job. ${note?.pr ? `Change #${note.pr}` : "The change"} is merged into the Office code (${change.url}). It is live after you press Publish in Lovable; then test it.`;
  if (change?.state === "closed") return `Claude's change for this job was closed without merging (${change.url}).${link} Ask Claude in its thread what happened.`;
  if (!note) return "This task was handed to a full Claude worker, but Claude's progress note could not be read. Do not re-run the small builder; ask again shortly.";
  switch (note.state) {
    case "waiting": return "Handed to a full Claude worker. It has not been picked up yet; Claude checks for handed-over jobs about every hour. Nothing needs re-running.";
    case "taken":
    case "working": return `A full Claude worker has this job and is building it now.${link} Nothing needs re-running.`;
    case "pr-open": return `Claude has built it and opened change #${note.pr ?? "?"}${change ? ` (${change.url})` : ""}. It merges itself once its checks pass; after that you press Publish.${link}`;
    case "merged": return `Claude's change #${note.pr ?? "?"} is merged. It is live after you press Publish in Lovable; then test it.${link}`;
    case "live": return `Claude's change${note.pr ? ` #${note.pr}` : ""} is live in the Office.${note.note ? " " + note.note : ""}`;
    case "blocked": return `Claude stopped and needs your decision: ${note.note ?? "see Claude's session"}.${link}`;
  }
}
