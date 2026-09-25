/**
 * Companion → Astra decision handoffs (pure helpers, browser-safe).
 *
 * A decision handoff is ONE tracked request John reviewed and sent from the
 * CanX Office companion. It becomes exactly one owner-scoped manager_tasks row.
 * The stable correlation id is written into the task's own detail as a marker
 * line, so no database change is needed and a repeated send can find the task
 * that already exists instead of creating a second one.
 */

import { WORKER_SEATS } from "@/lib/manager-workers";
import { redactSecrets, type WorkTurnLike } from "@/lib/companion-bridge";

export const DECISION_MARKER_PREFIX = "[canx-handoff:";
const ID_PATTERN = /^h-[a-z0-9]{4,16}-[a-z0-9]{3,10}$/;

export function isCorrelationId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

export function decisionMarker(id: string): string {
  return `${DECISION_MARKER_PREFIX}${id}]`;
}

export function correlationFromDetail(detail: string): string | null {
  const match = /^\[canx-handoff:(h-[a-z0-9]{4,16}-[a-z0-9]{3,10})\]/.exec(detail ?? "");
  return match ? match[1]! : null;
}

export interface DecisionDraft {
  correlationId: string;
  source: string;
  request: string;
  outcome: string;
  /** A WORKER_SEATS id, or "" for "leave unassigned". */
  workerId: string;
}

export const DECISION_SOURCE = "CanX Office companion (OpenAI) — selected written discussion";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Keyword suggestion only. John can change it; nothing is assigned until he sends. */
export function suggestWorker(text: string): string {
  const t = text.toLowerCase();
  if (/receipt|invoice|budget|cost|money|finance|expense|tax/.test(t)) return "w-finance-records";
  if (/security|password|login|mfa|connection|access|key\b|systems?/.test(t)) return "w-quality-security";
  if (/project|safe highways|trail tales|milestone|roadmap/.test(t)) return "w-projects";
  if (/idea|research|bike rack|opportunit|rfp|contract/.test(t)) return "w-ideas";
  if (/schedule|operation|work board|follow.?up|task/.test(t)) return "w-operations";
  return "w-manager-office";
}

export function workerName(id: string): string | null {
  return WORKER_SEATS.find((s) => s.id === id)?.name ?? null;
}

/** Builds the concise editable decision from ONE selected exchange. */
export function buildDecisionDraft(turns: WorkTurnLike[], userIndex: number, correlationId: string): DecisionDraft | null {
  const request = turns[userIndex];
  if (!request || request.role !== "user" || !request.content.trim()) return null;
  const next = turns[userIndex + 1];
  const reply = next?.role === "assistant" ? next.content.trim() : "";
  const req = clip(redactSecrets(request.content.trim()), 600);
  return {
    correlationId,
    source: DECISION_SOURCE,
    request: req,
    outcome: reply ? clip(redactSecrets(reply.split("\n").find((l) => l.trim()) ?? ""), 400) : "",
    workerId: suggestWorker(`${request.content} ${reply}`),
  };
}

/** Task title and detail written to manager_tasks. Marker line first. */
export function decisionTaskFields(d: DecisionDraft): { title: string; detail: string } {
  const title = clip(d.request.replace(/\s+/g, " ").trim(), 280) || "Companion request";
  const detail = [
    decisionMarker(d.correlationId),
    `Source: ${clip(d.source, 160)}`,
    `Request: ${clip(d.request, 800)}`,
    `Outcome expected: ${clip(d.outcome || "Not stated", 500)}`,
    `Suggested worker: ${workerName(d.workerId) ?? "none — awaiting assignment"}`,
  ].join("\n");
  return { title, detail: detail.slice(0, 2000) };
}

export type DecisionStage =
  | "awaiting_assignment"
  | "assigned"
  | "worker_answered"
  | "done"
  | "cancelled";

export interface DecisionStatus {
  correlationId: string;
  taskId: string;
  title: string;
  stage: DecisionStage;
  worker: string;
  result: string;
  evidence: string;
  createdAt: string;
  updatedAt: string;
}

export const DECISION_STAGE_LABEL: Record<DecisionStage, string> = {
  awaiting_assignment: "Saved — awaiting assignment",
  assigned: "Assigned — no worker answer yet",
  worker_answered: "Worker answered — waiting for your check",
  done: "Checked and done",
  cancelled: "Cancelled",
};

export function stageFor(task: { status: string; worker: string }, assignment: { result: string } | null): DecisionStage {
  if (task.status === "done") return "done";
  if (task.status === "cancelled") return "cancelled";
  if (assignment?.result?.trim()) return "worker_answered";
  if (task.worker?.trim()) return "assigned";
  return "awaiting_assignment";
}

/* ------------------------ device-only companion thread ------------------------ */

export const COMPANION_THREAD_KEY = "canx:companion-thread:v1";
export const COMPANION_INFLIGHT_KEY = "canx:companion-inflight:v1";

export function saveLocal(key: string, value: unknown): boolean {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadLocal<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
