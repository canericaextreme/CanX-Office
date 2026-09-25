/**
 * Companion → Astra decision handoffs — SERVER side.
 *
 * - Verified owner only (same owner/MFA check and RLS as the Work Board).
 * - One task per correlation id: the server looks for an existing task with the
 *   same marker BEFORE inserting, and again after an ambiguous insert failure.
 * - A task counts as saved only after it is read back.
 * - Assignment happens only to a real worker seat. Otherwise the task stays
 *   "awaiting assignment". Nothing is ever marked done here.
 * - Asking the worker is a separate press by John and goes through the existing
 *   budget-guarded consultation. Its real answer is recorded as evidence.
 */

import { createServerFn } from "@tanstack/react-start";
import type { OwnerVerification } from "@/lib/canx-backend.server";
import type { ConsultDeps, ConsultReply } from "@/lib/manager-workers.functions";
import {
  correlationFromDetail,
  decisionMarker,
  decisionTaskFields,
  isCorrelationId,
  stageFor,
  workerName,
  type DecisionDraft,
  type DecisionStatus,
} from "@/lib/companion-decision";
import { WORKER_SEATS } from "@/lib/manager-workers";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export interface DecisionDeps {
  verifyOwner: (token: string) => Promise<OwnerVerification>;
  rest: (token: string, method: string, path: string, body?: { [k: string]: Json }) => Promise<{ ok: boolean; data?: unknown }>;
}

interface TaskRow {
  id: string;
  owner_id: string;
  title: string;
  detail: string;
  status: string;
  worker: string;
  result: string;
  evidence: string;
  created_at: string;
  updated_at: string;
}
interface AssignmentRow {
  id: string;
  task_id: string;
  worker: string;
  result: string;
  evidence: string;
  assigned_at: string;
}

export type DecisionError = {
  ok: false;
  code: "auth_not_ready" | "invalid_input" | "not_saved" | "not_found" | "unavailable";
  message: string;
};
export type DecisionResult =
  | { ok: true; status: DecisionStatus; duplicate: boolean; assignmentNote: string }
  | DecisionError;

const fail = (code: DecisionError["code"], message: string): DecisionError => ({ ok: false, code, message });
const rowsOf = <T>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : data && typeof data === "object" ? [data as T] : []);

function toStatus(task: TaskRow, assignment: AssignmentRow | null): DecisionStatus {
  return {
    correlationId: correlationFromDetail(task.detail) ?? "",
    taskId: task.id,
    title: task.title,
    stage: stageFor(task, assignment),
    worker: task.worker || assignment?.worker || "",
    result: assignment?.result || task.result || "",
    evidence: assignment?.evidence || task.evidence || "",
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  };
}

async function findByCorrelation(deps: DecisionDeps, token: string, ownerId: string, id: string) {
  const pattern = encodeURIComponent(`${decisionMarker(id)}*`);
  const res = await deps.rest(
    token,
    "GET",
    `manager_tasks?owner_id=eq.${encodeURIComponent(ownerId)}&detail=like.${pattern}&order=created_at.asc&limit=1`,
  );
  if (!res.ok) return { ok: false as const };
  return { ok: true as const, task: rowsOf<TaskRow>(res.data)[0] ?? null };
}

async function latestAssignment(deps: DecisionDeps, token: string, taskId: string) {
  const res = await deps.rest(
    token,
    "GET",
    `manager_assignments?task_id=eq.${encodeURIComponent(taskId)}&order=assigned_at.desc&limit=1`,
  );
  return res.ok ? (rowsOf<AssignmentRow>(res.data)[0] ?? null) : null;
}

async function readTask(deps: DecisionDeps, token: string, taskId: string): Promise<TaskRow | null> {
  const res = await deps.rest(token, "GET", `manager_tasks?id=eq.${encodeURIComponent(taskId)}`);
  return res.ok ? (rowsOf<TaskRow>(res.data)[0] ?? null) : null;
}

export function sanitizeDecision(input: unknown): DecisionDraft & { accessToken: string } {
  const raw = (input ?? {}) as Record<string, unknown>;
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n).trim() : "");
  return {
    accessToken: s(raw["accessToken"], 4000),
    correlationId: s(raw["correlationId"], 40),
    source: s(raw["source"], 160),
    request: s(raw["request"], 800),
    outcome: s(raw["outcome"], 500),
    workerId: s(raw["workerId"], 60),
  };
}

export async function submitDecisionWith(
  deps: DecisionDeps,
  input: DecisionDraft & { accessToken: string },
): Promise<DecisionResult> {
  const v = await deps.verifyOwner(input.accessToken);
  if (!v.ok) return fail("auth_not_ready", v.message);
  if (!isCorrelationId(input.correlationId)) return fail("invalid_input", "The request id is missing or malformed.");
  if (!input.request.trim()) return fail("invalid_input", "Write the request before sending it to Astra.");
  if (input.workerId && !workerName(input.workerId)) return fail("invalid_input", "That worker does not exist.");
  const token = input.accessToken;

  // 1. Never create a second task for the same request.
  const existing = await findByCorrelation(deps, token, v.userId, input.correlationId);
  if (!existing.ok) return fail("unavailable", "The office records could not be checked, so nothing was sent. Try again.");
  if (existing.task) {
    const a = await latestAssignment(deps, token, existing.task.id);
    return { ok: true, status: toStatus(existing.task, a), duplicate: true, assignmentNote: "This request was already saved; no second task was made." };
  }

  // 2. Insert, then read back. After an ambiguous failure, look again first.
  const fields = decisionTaskFields(input);
  const insert = await deps.rest(token, "POST", "manager_tasks", {
    owner_id: v.userId,
    title: fields.title,
    detail: fields.detail,
    risk: "green",
  });
  let created = insert.ok ? (rowsOf<TaskRow>(insert.data)[0] ?? null) : null;
  if (!created) {
    const again = await findByCorrelation(deps, token, v.userId, input.correlationId);
    created = again.ok ? again.task : null;
    if (!created) return fail("not_saved", "Astra could not confirm the task was saved. Nothing is being tracked yet — press Send again; it checks for a saved copy first.");
  }
  const readback = await readTask(deps, token, created.id);
  if (!readback || correlationFromDetail(readback.detail) !== input.correlationId) {
    return fail("not_saved", "The task was sent but could not be read back, so it is not confirmed. Press Send again to re-check.");
  }

  await deps
    .rest(token, "POST", "rpc/log_manager_change", {
      _owner_id: v.userId,
      _action: "task.create",
      _entity: "manager_tasks",
      _entity_id: readback.id,
      _before: {},
      _after: { title: fields.title, status: "open", source: "companion_handoff", correlation: input.correlationId },
    })
    .catch(() => undefined);

  // 3. Assign only to a real seat.
  const name = input.workerId ? workerName(input.workerId) : null;
  if (!name) {
    return { ok: true, status: toStatus(readback, null), duplicate: false, assignmentNote: "No worker chosen — the task is waiting for assignment." };
  }
  const [patch, assign] = await Promise.all([
    deps.rest(token, "PATCH", `manager_tasks?id=eq.${encodeURIComponent(readback.id)}`, {
      status: "in_progress",
      worker: name,
      updated_at: new Date().toISOString(),
    }),
    deps.rest(token, "POST", "manager_assignments", { task_id: readback.id, worker: name }),
  ]);
  const afterTask = await readTask(deps, token, readback.id);
  const afterAssign = await latestAssignment(deps, token, readback.id);
  if (!patch.ok || !assign.ok || !afterTask || afterTask.worker !== name || !afterAssign) {
    return {
      ok: true,
      status: toStatus(afterTask ?? readback, afterAssign),
      duplicate: false,
      assignmentNote: `The task is saved, but the assignment to ${name} could not be confirmed. It is waiting for assignment.`,
    };
  }
  await deps
    .rest(token, "POST", "rpc/log_manager_change", {
      _owner_id: v.userId,
      _action: "task.assign",
      _entity: "manager_tasks",
      _entity_id: readback.id,
      _before: { status: "open", worker: "" },
      _after: { status: "in_progress", worker: name },
    })
    .catch(() => undefined);
  return {
    ok: true,
    status: toStatus(afterTask, afterAssign),
    duplicate: false,
    assignmentNote: `Assigned to ${name}. The worker has not answered yet — press "Ask ${name} now" when you want a real answer.`,
  };
}

export async function listDecisionsWith(
  deps: DecisionDeps,
  token: string,
): Promise<{ ok: true; items: DecisionStatus[]; readAt: string } | DecisionError> {
  const v = await deps.verifyOwner(token);
  if (!v.ok) return fail("auth_not_ready", v.message);
  const pattern = encodeURIComponent("[canx-handoff:*");
  const res = await deps.rest(
    token,
    "GET",
    `manager_tasks?owner_id=eq.${encodeURIComponent(v.userId)}&detail=like.${pattern}&order=created_at.desc&limit=20`,
  );
  if (!res.ok) return fail("unavailable", "Tracked requests could not be read from the office records just now.");
  const tasks = rowsOf<TaskRow>(res.data);
  const items = await Promise.all(tasks.map(async (t) => toStatus(t, await latestAssignment(deps, token, t.id))));
  return { ok: true, items, readAt: new Date().toISOString() };
}

export interface AskWorkerDeps extends DecisionDeps {
  consult: (input: { accessToken: string; workerId: string; room: string; question: string; taskId: string; thread: [] }) => Promise<ConsultReply>;
}

/** One real, budget-guarded worker consultation for a tracked task. John's press only. */
export async function askDecisionWorkerWith(
  deps: AskWorkerDeps,
  input: { accessToken: string; taskId: string },
): Promise<DecisionResult> {
  const v = await deps.verifyOwner(input.accessToken);
  if (!v.ok) return fail("auth_not_ready", v.message);
  const task = await readTask(deps, input.accessToken, input.taskId);
  if (!task || task.owner_id !== v.userId || !correlationFromDetail(task.detail)) return fail("not_found", "Tracked request not found.");
  const seat = WORKER_SEATS.find((s) => s.name === task.worker);
  if (!seat || task.status !== "in_progress") return fail("invalid_input", "This request is not assigned to a worker that can be asked.");

  const reply = await deps.consult({
    accessToken: input.accessToken,
    workerId: seat.id,
    room: seat.roomId,
    question: `Tracked request ${task.id}.\n${task.detail}\nGive your conclusion and the next step.`,
    taskId: task.id,
    thread: [],
  });
  if (!reply.ok || !reply.answer) {
    return fail("unavailable", reply.detail || `${seat.name} did not return a usable answer. Nothing was recorded.`);
  }
  const answer = reply.answer;
  const result = `${answer.conclusion} Next step: ${answer.nextStep}`.slice(0, 2000);
  const evidence = [
    `Worker ${seat.name}, model ${reply.model ?? "unknown"}, answered ${reply.answeredAt}, confidence ${answer.confidence}.`,
    answer.evidenceUsed.length ? `Evidence used: ${answer.evidenceUsed.join("; ")}` : "Evidence used: none listed.",
    answer.missingEvidence.length ? `Missing: ${answer.missingEvidence.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);
  const assignment = await latestAssignment(deps, input.accessToken, task.id);
  if (!assignment) return fail("not_saved", "The worker answered, but no assignment row exists to record it on.");
  const write = await deps.rest(input.accessToken, "PATCH", `manager_assignments?id=eq.${encodeURIComponent(assignment.id)}`, {
    result,
    evidence,
  });
  const after = await latestAssignment(deps, input.accessToken, task.id);
  if (!write.ok || after?.result !== result) {
    return fail("not_saved", `${seat.name} answered, but the answer could not be saved and read back. It is not recorded.`);
  }
  const fresh = (await readTask(deps, input.accessToken, task.id)) ?? task;
  return { ok: true, status: toStatus(fresh, after), duplicate: false, assignmentNote: `${seat.name}'s answer is recorded. It is not marked done — check it on the Work Board.` };
}

/* ------------------------------ real deps ------------------------------ */

async function realDeps(): Promise<DecisionDeps> {
  const backend = await import("@/lib/canx-backend.server");
  const config = backend.readBackendConfig();
  return {
    verifyOwner: (token) => backend.verifyOwnerWith(config, token),
    rest: async (token, method, path, body) => {
      if (!config) return { ok: false };
      const init: RequestInit = { method };
      if (body && method !== "GET") init.body = JSON.stringify(body);
      const r = await backend.restRequest(config, token, path, init);
      return { ok: r.ok, data: r.body };
    },
  };
}

const token = (input: unknown) => {
  const raw = (input ?? {}) as Record<string, unknown>;
  return typeof raw["accessToken"] === "string" ? (raw["accessToken"] as string).slice(0, 4000) : "";
};

export const submitCompanionDecision = createServerFn({ method: "POST" })
  .inputValidator(sanitizeDecision)
  .handler(async ({ data }) => submitDecisionWith(await realDeps(), data));

export const listCompanionDecisions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ({ accessToken: token(input) }))
  .handler(async ({ data }) => listDecisionsWith(await realDeps(), data.accessToken));

export const askCompanionDecisionWorker = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = (input ?? {}) as Record<string, unknown>;
    return { accessToken: token(input), taskId: typeof raw["taskId"] === "string" ? (raw["taskId"] as string).slice(0, 60) : "" };
  })
  .handler(async ({ data }) => {
    const base = await realDeps();
    const workers = await import("@/lib/manager-workers.functions");
    const consultDeps: ConsultDeps = await workers.realConsultDeps();
    return askDecisionWorkerWith(
      { ...base, consult: (i) => workers.consultRoomWorkerWith(consultDeps, i) },
      data,
    );
  });
