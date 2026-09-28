/**
 * Hand an authorised GREEN code-change Work Board task to the existing Codex
 * build path. Never marks a task done: completion still requires verify_task
 * with real build/test evidence. Never retries.
 */
import type { CodexBuildResult } from "./codex-builds.server";
import type { RiskLevel } from "./manager-work.functions";

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
