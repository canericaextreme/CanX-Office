/**
 * Manager Workbench — durable task list, approvals, change log, and budget.
 *
 * All functions are server-only and fail closed. They reuse the same owner/AAL2
 * verification, RLS request helper, and AI budget reservation as the Office
 * Manager and Claude. No browser claim is trusted.
 */

import { createServerFn } from "@tanstack/react-start";
import type { BudgetResult, OwnerVerification } from "@/lib/canx-backend.server";
import { runClaudeReviewWith, type ReviewInput } from "@/lib/claude-review.functions";

export type RiskLevel = "green" | "yellow" | "red";

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

export interface ManagerTask {
  id: string;
  owner_id: string;
  title: string;
  detail: string;
  status: "open" | "in_progress" | "done" | "cancelled";
  risk: RiskLevel;
  worker: string;
  result: string;
  evidence: string;
  created_at: string;
  updated_at: string;
}

export interface ManagerAssignment {
  id: string;
  task_id: string;
  worker: string;
  assigned_at: string;
  completed_at: string | null;
  result: string;
  evidence: string;
}

export interface ManagerApproval {
  id: string;
  owner_id: string;
  task_id: string | null;
  title: string;
  detail: string;
  cost_cents: number | null;
  risk: RiskLevel;
  status: "pending" | "approved" | "declined";
  created_at: string;
  decided_at: string | null;
}

export interface ManagerChange {
  id: number;
  owner_id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  before: JsonObject;
  after: JsonObject;
  at: string;
}

export interface ManagerBudgetStatus {
  used_cents: number;
  ceiling_cents: number;
  warn_cents: number;
  paused: boolean;
  warning: boolean;
}

export interface ManagerMemory {
  ok: true;
  tasks: ManagerTask[];
  assignments: ManagerAssignment[];
  approvals: ManagerApproval[];
  changes: ManagerChange[];
  budget: ManagerBudgetStatus;
}

export interface ManagerWorkError {
  ok: false;
  code: "auth_not_ready" | "limit_blocked" | "invalid_input" | "not_found" | "forbidden" | "context_unavailable";
  message: string;
}

export interface WorkbenchDeps {
  verifyOwner: (token: string) => Promise<OwnerVerification>;
  reserve: (token: string, cents: number) => Promise<BudgetResult>;
  settle: (token: string, reservationId: string, outcome: "ok" | "failed") => Promise<void>;
  rest: <T>(token: string, method: string, path: string, body?: JsonObject) => Promise<{ ok: boolean; data?: T; error?: string }>;
  ensureBudget: (token: string, ownerId: string) => Promise<{ ok: boolean; error?: string }>;
}

function readSetting(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function realDeps(): Promise<WorkbenchDeps> {
  const backend = await import("@/lib/canx-backend.server");
  const config = backend.readBackendConfig();
  return {
    verifyOwner: (token) => backend.verifyOwnerWith(config, token),
    reserve: (token, cents) => backend.reserveAiCallWith(config, token, cents),
    settle: (token, id, outcome) => backend.settleAiCallWith(config, token, id, outcome),
    rest: async <T>(token: string, method: string, path: string, body?: JsonObject) => {
      if (!config) return { ok: false, error: "No CanX-owned database is configured." };
      const init: RequestInit = { method };
      if (body && method !== "GET") init.body = JSON.stringify(body);
      const result = await backend.restRequest(config, token, path, init);
      if (!result.ok) return { ok: false, error: `Request failed (${result.status}).` };
      return { ok: true, data: result.body as unknown as T };
    },
    ensureBudget: async (token, ownerId) => {
      if (!config) return { ok: false, error: "No CanX-owned database is configured." };
      const result = await backend.restRequest(config, token, "rpc/ensure_manager_ai_budget", {
        method: "POST",
        body: JSON.stringify({ _owner_id: ownerId }),
      });
      return result.ok ? { ok: true } : { ok: false, error: "Budget setup failed." };
    },
  };
}

function fail(code: ManagerWorkError["code"], message: string): ManagerWorkError {
  return { ok: false, code, message };
}

async function verify(token: string, deps: WorkbenchDeps): Promise<Extract<OwnerVerification, { ok: true }> | ManagerWorkError> {
  const v = await deps.verifyOwner(token);
  if (!v.ok) return fail("auth_not_ready", v.message);
  return v;
}

function cleanString(value: unknown, limit: number): string {
  return (typeof value === "string" ? value : "").slice(0, limit).trim();
}

function cleanRisk(value: unknown): RiskLevel {
  if (value === "green" || value === "yellow" || value === "red") return value;
  return "green";
}

function cleanCents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.max(0, Math.round(value));
  return rounded > 100000 ? null : rounded;
}

function isError<T>(value: T | ManagerWorkError): value is ManagerWorkError {
  return value && typeof value === "object" && "ok" in value && value.ok === false;
}

/* ------------------------------- risk rules ------------------------------- */

/**
 * Deterministic risk classification for Manager actions. This cannot be talked
 * into changing by a model or a browser; the rules are fixed in code.
 */
export function classifyManagerRisk(action: string, scope?: string): RiskLevel {
  const a = action.toLowerCase();
  const s = (scope ?? "").toLowerCase();

  const red = [
    "deploy",
    "publish",
    "release",
    "send_email",
    "send_message",
    "dispatch",
    "purchase",
    "subscribe",
    "delete_data",
    "drop_table",
    "modify_production",
    "safety_critical",
    "authorize_spend",
  ];
  if (red.some((word) => a.includes(word))) return "red";
  if (s.includes("production") && (a.includes("write") || a.includes("update") || a.includes("delete"))) return "red";

  const yellow = [
    "request_approval",
    "migrate",
    "schema_change",
    "major_change",
    "cross_project_write",
    "external_write",
  ];
  if (yellow.some((word) => a.includes(word))) return "yellow";
  if ((s.includes("safe_highways") || s.includes("trail_tales")) && (a.includes("write") || a.includes("update") || a.includes("delete") || a.includes("change"))) {
    return "yellow";
  }

  return "green";
}

/* ------------------------------- budget ------------------------------- */

export async function getManagerBudgetStatusWith(deps: WorkbenchDeps, token: string): Promise<ManagerBudgetStatus | ManagerWorkError> {
  const v = await verify(token, deps);
  if (!v.ok) return v;

  const ensured = await deps.ensureBudget(token, v.userId);
  if (!ensured.ok) return fail("context_unavailable", ensured.error ?? "Budget setup failed.");

  const result = await deps.rest<ManagerBudgetStatus>(token, "POST", "rpc/manager_budget_status", { _owner_id: v.userId });
  if (!result.ok || !result.data) {
    return fail("context_unavailable", result.error ?? "Could not read the Manager budget.");
  }
  return result.data;
}

export async function reserveManagerAiCallWith(deps: WorkbenchDeps, token: string, cents: number): Promise<BudgetResult> {
  const v = await verify(token, deps);
  if (!v.ok) return { allowed: false, reason: "unavailable", message: v.message };
  const ensured = await deps.ensureBudget(token, v.userId);
  if (!ensured.ok) return { allowed: false, reason: "unavailable", message: ensured.error ?? "Budget setup failed." };
  return deps.reserve(token, cents);
}

/* ------------------------------- memory ------------------------------- */

export async function loadManagerMemoryWith(deps: WorkbenchDeps, token: string): Promise<ManagerMemory | ManagerWorkError> {
  const v = await verify(token, deps);
  if (!v.ok) return v;

  const ensured = await deps.ensureBudget(token, v.userId);
  if (!ensured.ok) return fail("context_unavailable", ensured.error ?? "Budget setup failed.");

  const [tasks, assignments, approvals, changes, budget] = await Promise.all([
    deps.rest<ManagerTask[]>(token, "GET", `manager_tasks?owner_id=eq.${encodeURIComponent(v.userId)}&order=created_at.desc`),
    deps.rest<ManagerAssignment[]>(token, "GET", "manager_assignments?order=assigned_at.desc"),
    deps.rest<ManagerApproval[]>(token, "GET", `manager_approvals?owner_id=eq.${encodeURIComponent(v.userId)}&order=created_at.desc`),
    deps.rest<ManagerChange[]>(token, "GET", `manager_changes?owner_id=eq.${encodeURIComponent(v.userId)}&order=at.desc&limit=50`),
    getManagerBudgetStatusWith(deps, token),
  ]);

  if (!tasks.ok) return fail("context_unavailable", tasks.error ?? "Could not read tasks.");
  if (!approvals.ok) return fail("context_unavailable", approvals.error ?? "Could not read approvals.");
  if (!changes.ok) return fail("context_unavailable", changes.error ?? "Could not read change log.");
  if (isError(budget)) return budget;

  return {
    ok: true,
    tasks: tasks.data ?? [],
    assignments: assignments.data ?? [],
    approvals: approvals.data ?? [],
    changes: changes.data ?? [],
    budget,
  };
}

/* ------------------------------- tasks ------------------------------- */

export interface CreateTaskInput {
  accessToken: string;
  title: string;
  detail?: string;
  risk?: RiskLevel;
}

export async function createManagerTaskWith(deps: WorkbenchDeps, input: CreateTaskInput): Promise<ManagerTask | ManagerWorkError> {
  const v = await verify(input.accessToken, deps);
  if (!v.ok) return v;

  const title = cleanString(input.title, 300);
  if (!title) return fail("invalid_input", "A task title is required.");

  const result = await deps.rest<ManagerTask>(input.accessToken, "POST", "manager_tasks", {
    owner_id: v.userId,
    title,
    detail: cleanString(input.detail, 2000),
    risk: cleanRisk(input.risk),
  });
  if (!result.ok || !result.data) return fail("context_unavailable", result.error ?? "Task could not be saved.");

  await deps.rest(input.accessToken, "POST", "rpc/log_manager_change", {
    _owner_id: v.userId,
    _action: "task.create",
    _entity: "manager_tasks",
    _entity_id: result.data.id,
    _before: {},
    _after: { title, risk: cleanRisk(input.risk), status: "open" },
  }).catch(() => undefined);

  return result.data;
}

export interface AssignTaskInput {
  accessToken: string;
  taskId: string;
  worker: string;
}

export async function assignManagerTaskWith(deps: WorkbenchDeps, input: AssignTaskInput): Promise<ManagerTask | ManagerWorkError> {
  const v = await verify(input.accessToken, deps);
  if (!v.ok) return v;

  const worker = cleanString(input.worker, 160);
  if (!worker) return fail("invalid_input", "A worker name is required.");

  const taskResult = await deps.rest<ManagerTask[]>(input.accessToken, "GET", `manager_tasks?id=eq.${encodeURIComponent(input.taskId)}`);
  if (!taskResult.ok || !taskResult.data?.[0]) return fail("not_found", "Task not found.");
  const before = taskResult.data[0];
  if (before.owner_id !== v.userId) return fail("forbidden", "That task belongs to a different owner.");

  const [updated] = await Promise.all([
    deps.rest<ManagerTask>(input.accessToken, "PATCH", `manager_tasks?id=eq.${encodeURIComponent(input.taskId)}`, {
      status: "in_progress",
      worker,
      updated_at: new Date().toISOString(),
    }),
    deps.rest<ManagerAssignment>(input.accessToken, "POST", "manager_assignments", {
      task_id: input.taskId,
      worker,
    }),
  ]);
  if (!updated.ok || !updated.data) return fail("context_unavailable", updated.error ?? "Assignment could not be saved.");

  await deps.rest(input.accessToken, "POST", "rpc/log_manager_change", {
    _owner_id: v.userId,
    _action: "task.assign",
    _entity: "manager_tasks",
    _entity_id: input.taskId,
    _before: { status: before.status, worker: before.worker },
    _after: { status: "in_progress", worker },
  }).catch(() => undefined);

  return updated.data;
}

export interface VerifyTaskInput {
  accessToken: string;
  taskId: string;
  result: string;
  evidence?: string;
}

export async function verifyManagerTaskWith(deps: WorkbenchDeps, input: VerifyTaskInput): Promise<ManagerTask | ManagerWorkError> {
  const v = await verify(input.accessToken, deps);
  if (!v.ok) return v;

  const resultText = cleanString(input.result, 2000);
  if (!resultText) return fail("invalid_input", "A result summary is required to verify a task.");

  const taskResult = await deps.rest<ManagerTask[]>(input.accessToken, "GET", `manager_tasks?id=eq.${encodeURIComponent(input.taskId)}`);
  if (!taskResult.ok || !taskResult.data?.[0]) return fail("not_found", "Task not found.");
  const before = taskResult.data[0];
  if (before.owner_id !== v.userId) return fail("forbidden", "That task belongs to a different owner.");

  const evidence = cleanString(input.evidence, 2000);
  const now = new Date().toISOString();

  const [updated] = await Promise.all([
    deps.rest<ManagerTask>(input.accessToken, "PATCH", `manager_tasks?id=eq.${encodeURIComponent(input.taskId)}`, {
      status: "done",
      result: resultText,
      evidence,
      updated_at: now,
    }),
    deps.rest(input.accessToken, "PATCH", `manager_assignments?task_id=eq.${encodeURIComponent(input.taskId)}&completed_at=is.null`, {
      completed_at: now,
      result: resultText,
      evidence,
    }),
  ]);
  if (!updated.ok || !updated.data) return fail("context_unavailable", updated.error ?? "Verification could not be saved.");

  await deps.rest(input.accessToken, "POST", "rpc/log_manager_change", {
    _owner_id: v.userId,
    _action: "task.verify",
    _entity: "manager_tasks",
    _entity_id: input.taskId,
    _before: { status: before.status, result: before.result },
    _after: { status: "done", result: resultText, evidence },
  }).catch(() => undefined);

  return updated.data;
}

/* ------------------------------- approvals ------------------------------- */

export interface RequestApprovalInput {
  accessToken: string;
  title: string;
  detail?: string;
  costCents?: number | null;
  risk?: RiskLevel;
  taskId?: string | null;
}

export async function requestManagerApprovalWith(deps: WorkbenchDeps, input: RequestApprovalInput): Promise<ManagerApproval | ManagerWorkError> {
  const v = await verify(input.accessToken, deps);
  if (!v.ok) return v;

  const title = cleanString(input.title, 300);
  if (!title) return fail("invalid_input", "An approval title is required.");

  const risk = cleanRisk(input.risk);
  if (risk === "red") return fail("forbidden", "Red-light actions cannot be queued for approval; they are stopped.");

  const costCents = cleanCents(input.costCents);

  const result = await deps.rest<ManagerApproval>(input.accessToken, "POST", "manager_approvals", {
    owner_id: v.userId,
    task_id: input.taskId ? cleanString(input.taskId, 100) : null,
    title,
    detail: cleanString(input.detail, 2000),
    cost_cents: costCents,
    risk,
    status: "pending",
  });
  if (!result.ok || !result.data) return fail("context_unavailable", result.error ?? "Approval request could not be saved.");

  await deps.rest(input.accessToken, "POST", "rpc/log_manager_change", {
    _owner_id: v.userId,
    _action: "approval.request",
    _entity: "manager_approvals",
    _entity_id: result.data.id,
    _before: {},
    _after: { title, risk, cost_cents: costCents, status: "pending" },
  }).catch(() => undefined);

  return result.data;
}

export interface DecideApprovalInput {
  accessToken: string;
  approvalId: string;
  decision: "approved" | "declined";
}

export async function decideManagerApprovalWith(deps: WorkbenchDeps, input: DecideApprovalInput): Promise<ManagerApproval | ManagerWorkError> {
  const v = await verify(input.accessToken, deps);
  if (!v.ok) return v;

  const decision = input.decision === "approved" ? "approved" : "declined";

  const approvalResult = await deps.rest<ManagerApproval[]>(input.accessToken, "GET", `manager_approvals?id=eq.${encodeURIComponent(input.approvalId)}`);
  if (!approvalResult.ok || !approvalResult.data?.[0]) return fail("not_found", "Approval request not found.");
  const before = approvalResult.data[0];
  if (before.owner_id !== v.userId) return fail("forbidden", "That approval belongs to a different owner.");
  if (before.status !== "pending") return fail("forbidden", "This approval has already been decided.");

  const result = await deps.rest<ManagerApproval>(input.accessToken, "PATCH", `manager_approvals?id=eq.${encodeURIComponent(input.approvalId)}`, {
    status: decision,
    decided_at: new Date().toISOString(),
  });
  if (!result.ok || !result.data) return fail("context_unavailable", result.error ?? "Approval decision could not be saved.");

  await deps.rest(input.accessToken, "POST", "rpc/log_manager_change", {
    _owner_id: v.userId,
    _action: "approval.decide",
    _entity: "manager_approvals",
    _entity_id: input.approvalId,
    _before: { status: before.status },
    _after: { status: decision },
  }).catch(() => undefined);

  return result.data;
}

/* ------------------------------- change log ------------------------------- */

export interface LogChangeInput {
  accessToken: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: JsonObject | Record<string, unknown>;
  after?: JsonObject | Record<string, unknown>;
}

function toJsonObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const out: JsonObject = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        out[k] = v;
      } else if (Array.isArray(v)) {
        out[k] = v.map(toJsonObject) as JsonValue[];
      } else {
        out[k] = toJsonObject(v);
      }
    }
    return out;
  }
  return {};
}

export async function logManagerChangeWith(deps: WorkbenchDeps, input: LogChangeInput): Promise<{ ok: true } | ManagerWorkError> {
  const v = await verify(input.accessToken, deps);
  if (!v.ok) return v;

  const result = await deps.rest(input.accessToken, "POST", "rpc/log_manager_change", {
    _owner_id: v.userId,
    _action: cleanString(input.action, 120),
    _entity: cleanString(input.entity, 120),
    _entity_id: input.entityId ? cleanString(input.entityId, 120) : null,
    _before: toJsonObject(input.before),
    _after: toJsonObject(input.after),
  });
  if (!result.ok) return fail("context_unavailable", result.error ?? "Change could not be logged.");
  return { ok: true };
}

/* ------------------------------- second eyes ------------------------------- */

export interface SecondEyesInput {
  accessToken: string;
  subject: string;
  primaryRecommendation: string;
  evidence: string;
  question: string;
}

export async function runManagerSecondEyesWith(deps: WorkbenchDeps, input: SecondEyesInput): Promise<ReturnType<typeof runClaudeReviewWith>> {
  const v = await verify(input.accessToken, deps);
  if (!v.ok) {
    return {
      ok: false,
      code: "auth_not_ready",
      provider: "none",
      state: "auth_unavailable",
      model: null,
      reviewer: "Claude — independent review",
      review: null,
      text: "",
      detail: v.message,
    };
  }

  const reservation = await deps.reserve(input.accessToken, 3);
  if (!reservation.allowed) {
    return {
      ok: false,
      code: "limit_blocked",
      provider: "none",
      state: "configured_unverified",
      model: null,
      reviewer: "Claude — independent review",
      review: null,
      text: "",
      detail: reservation.message,
    };
  }

  const reviewInput: ReviewInput = {
    accessToken: input.accessToken,
    subject: cleanString(input.subject, 300),
    primaryRecommendation: cleanString(input.primaryRecommendation, 6000),
    evidence: cleanString(input.evidence, 6000),
    question: cleanString(input.question, 2000),
  };

  const claudeDeps = {
    verifyOwner: deps.verifyOwner,
    reserve: deps.reserve,
    settle: deps.settle,
    fetchImpl: (input: string | Request | URL, init?: RequestInit) => fetch(input, init),
    anthropicKey: readSetting(process.env["ANTHROPIC_API_KEY"]),
    model: readSetting(process.env["ANTHROPIC_MODEL"]),
  };

  try {
    const reply = await runClaudeReviewWith(claudeDeps, reviewInput);
    await deps.settle(input.accessToken, reservation.reservationId, reply.ok ? "ok" : "failed");
    return reply;
  } catch (error) {
    await deps.settle(input.accessToken, reservation.reservationId, "failed");
    return {
      ok: false,
      code: "provider_error",
      provider: "none",
      state: "configured_unverified",
      model: null,
      reviewer: "Claude — independent review",
      review: null,
      text: "",
      detail: error instanceof Error ? error.message : "Claude review failed.",
    };
  }
}

/* ------------------------------ server fns ------------------------------- */

function strAccess(input: unknown): { accessToken: string } {
  const raw = input as { accessToken?: unknown } | undefined;
  return { accessToken: typeof raw?.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "" };
}

export const loadManagerMemory = createServerFn({ method: "POST" })
  .inputValidator(strAccess)
  .handler(async ({ data }) => loadManagerMemoryWith(await realDeps(), data.accessToken));

export const createManagerTask = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = input as Partial<CreateTaskInput> | undefined;
    return {
      accessToken: strAccess(input).accessToken,
      title: cleanString(raw?.title, 300),
      detail: cleanString(raw?.detail, 2000),
      risk: cleanRisk(raw?.risk),
    };
  })
  .handler(async ({ data }) => createManagerTaskWith(await realDeps(), data));

export const assignManagerTask = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = input as Partial<AssignTaskInput> | undefined;
    return {
      accessToken: strAccess(input).accessToken,
      taskId: cleanString(raw?.taskId, 100),
      worker: cleanString(raw?.worker, 160),
    };
  })
  .handler(async ({ data }) => assignManagerTaskWith(await realDeps(), data));

export const verifyManagerTask = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = input as Partial<VerifyTaskInput> | undefined;
    return {
      accessToken: strAccess(input).accessToken,
      taskId: cleanString(raw?.taskId, 100),
      result: cleanString(raw?.result, 2000),
      evidence: cleanString(raw?.evidence, 2000),
    };
  })
  .handler(async ({ data }) => verifyManagerTaskWith(await realDeps(), data));

export const requestManagerApproval = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = input as Partial<RequestApprovalInput> | undefined;
    return {
      accessToken: strAccess(input).accessToken,
      title: cleanString(raw?.title, 300),
      detail: cleanString(raw?.detail, 2000),
      costCents: cleanCents(raw?.costCents) ?? null,
      risk: cleanRisk(raw?.risk),
      taskId: cleanString(raw?.taskId, 100) || null,
    };
  })
  .handler(async ({ data }) => requestManagerApprovalWith(await realDeps(), data));

export const decideManagerApproval = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = input as Partial<DecideApprovalInput> | undefined;
    return {
      accessToken: strAccess(input).accessToken,
      approvalId: cleanString(raw?.approvalId, 100),
      decision: raw?.decision === "approved" ? ("approved" as const) : ("declined" as const),
    };
  })
  .handler(async ({ data }) => decideManagerApprovalWith(await realDeps(), data));

export const getManagerBudgetStatus = createServerFn({ method: "POST" })
  .inputValidator(strAccess)
  .handler(async ({ data }) => getManagerBudgetStatusWith(await realDeps(), data.accessToken));

export const runManagerSecondEyes = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = input as Partial<SecondEyesInput> | undefined;
    return {
      accessToken: strAccess(input).accessToken,
      subject: cleanString(raw?.subject, 300),
      primaryRecommendation: cleanString(raw?.primaryRecommendation, 6000),
      evidence: cleanString(raw?.evidence, 6000),
      question: cleanString(raw?.question, 2000),
    };
  })
  .handler(async ({ data }) => runManagerSecondEyesWith(await realDeps(), data));
