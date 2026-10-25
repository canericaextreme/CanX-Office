/**
 * Hand an authorised GREEN code-change Work Board task to the existing Codex
 * build path. Never marks a task done: completion still requires verify_task
 * with real build/test evidence. Never retries.
 */
import type { CodexBuildResult } from "./codex-builds.server";
import type { RiskLevel } from "./manager-work.functions";
import { protectedBuildCategoryOf } from "./protected-actions";
import { touchesLegal } from "./autopilot";

/** Ignore only standalone routing instructions to our fixed internal builder.
 * Keep the original request intact for execution, and retain every other
 * protected-action check (including external sends in the same request).
 */
export function officeBuildProtectedCategory(request: string): string | null {
  const scope = request.replace(
    /(^|[.!?\n])([ \t]*)(?:send|submit) (?:it |this task |the task )?to (?:the )?(?:builder|codex|claude)(?: (?:once(?: only)?|only once))?[ \t]*(?=[.!?\n]|$)/gi,
    "$1$2",
  );
  // 21 Oct 2026: legal matters wait for John, like money.
  if (touchesLegal(scope)) return "legal";
  return protectedBuildCategoryOf(scope);
}

export interface CodexHandoffGate {
  codeChange: boolean;
  /** Risk the model put on the task. */
  taskRisk: RiskLevel;
  /** Deterministic server classification of the build request. */
  classifiedRisk: RiskLevel;
  /** Protected category (spending, deletion, security, …) or null. */
  protectedCategory: string | null;
  /** True when a Codex build was already attempted in this Manager turn. */
  alreadySubmitted: boolean;
}

/**
 * Deterministic backstop for the model's code_change flag: a plain owner
 * instruction to change something visible in the office (e.g. "remove the
 * search box at the top of the page") is a code-change request even when the
 * model forgets to set the flag. Risk and protected checks still apply.
 */
// 21 Oct 2026 (John: "she needs to hear the tasks"): "separate the ChatGPT and Claude buttons"
// was refused because "separate" was missing. Layout and wording verbs count like "move".
export const CHANGE_WORDS = String.raw`build|implement|code|fix|repair|apply|create|write|add|remove|delete|hide|unhide|change|move|shift|nudge|separate|space(?: out)?|spread(?: out)?|split|align|cent(?:er|re)|stack|swap|shrink|enlarge|widen|narrow|shorten|lengthen|rename|relabel|reword|replace|resize|recolou?r|colou?r|highlight|make|put|place|update|adjust|tweak|organi[sz]e|reorgani[sz]e|arrange|rearrange|redesign|restyle|tidy|clean up|simplify|restore|bring back|get rid of|take (?:out|off|away)`;
const CHANGE_VERBS = new RegExp(String.raw`\b(?:${CHANGE_WORDS}|show)\b`, "i");
const UI_TARGETS = /\b(page|screen|button|box|search|header|footer|banner|menu|nav(igation)?|layout|panel|card|icon|logo|text|writing|letters|label|title|colou?r|font|link|field|form|room|reception|sidebar|toolbar|tab)(?:s|es)?\b/i;
const SOURCE_TARGETS = /\b(file|component|function|test)\b|\b(?:src|docs|public)\//i;
export function looksLikeOfficeCodeChange(text: string): boolean {
  const t = text.trim();
  if (t.length < 10 || /\?\s*$/.test(t)) return false;
  return CHANGE_VERBS.test(t) && (UI_TARGETS.test(t) || SOURCE_TARGETS.test(t));
}

export function shouldHandOffToCodex(g: CodexHandoffGate): boolean {
  return (
    g.codeChange === true &&
    g.taskRisk === "green" &&
    g.classifiedRisk === "green" &&
    !g.protectedCategory &&
    !g.alreadySubmitted
  );
}

export interface CodexHandoffDeps {
  startBuild: (request: string) => Promise<CodexBuildResult>;
  /** Records status/evidence on the task. Must never set status "done". */
  recordOnTask: (patch: { status: "open" | "in_progress"; evidence: string }) => Promise<boolean>;
}

export interface CodexHandoffOutcome {
  submitted: boolean;
  status: "in_progress" | "open";
  detail: string;
  recorded: boolean;
}

export async function handOffTaskToCodex(deps: CodexHandoffDeps, request: string): Promise<CodexHandoffOutcome> {
  let result: CodexBuildResult;
  try {
    result = await deps.startBuild(request);
  } catch {
    result = { ok: false, detail: "The build submission could not be confirmed. Check Build & Testing before trying again." };
  }
  const at = new Date().toISOString();
  // Accepted builds keep the task in progress; failed/uncertain ones stay open
  // with the failure recorded. Neither is ever marked done here.
  const status = result.ok ? "in_progress" : "open";
  const evidence = `Codex handoff ${at}: ${result.ok ? "accepted" : "not confirmed"} — ${result.detail}${
    result.runs?.length ? ` Runs: ${result.runs.map((r) => `${r.id}:${r.state}`).join(", ")}` : ""
  } Not done until build/test evidence is verified.`;
  let recorded = false;
  try { recorded = await deps.recordOnTask({ status, evidence }); } catch { recorded = false; }
  return {
    submitted: result.ok,
    status,
    recorded,
    detail: `${result.ok ? "Sent to Codex; task stays in progress until real build and test evidence is verified." : "Codex build not confirmed; task left open. Nothing was retried."} ${result.detail}${recorded ? "" : " (The build note could not be saved on the task.)"}`,
  };
}
