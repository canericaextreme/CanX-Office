/** Elsie's narrow task repair adapters. The execution service and its gates stay unchanged. */
import { firstRow, type ManagerTask } from "./manager-work.functions";
import { executeTaskWith, readExecution, type TaskExecutionDeps } from "./task-execution.server";
import { sha256Hex } from "./sha256";
import type { OfficeBuilder } from "./builder-choice";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const attempted = (task: ManagerTask) =>
  !!readExecution(task.evidence) ||
  /office-task-v2|codex-task-v1|(?:Codex|Claude) handoff|elsie-claim|elsie-queue/i.test(
    task.evidence,
  );
async function owned(deps: TaskExecutionDeps, token: string, id: string) {
  const owner = await deps.workbench.verifyOwner(token);
  if (!owner.ok) return { error: owner.message };
  if (!uuid.test(id)) return { error: "Choose a saved task identifier." };
  const path = `manager_tasks?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(owner.userId)}`;
  const read = await deps.workbench.rest<ManagerTask[]>(token, "GET", path);
  const task = read.ok ? firstRow<ManagerTask>(read.data) : null;
  if (!task || task.owner_id !== owner.userId)
    return { error: "The saved task could not be read for this owner." };
  return { task, path, ownerId: owner.userId };
}

export async function editElsieTaskWith(
  deps: TaskExecutionDeps,
  token: string,
  id: string,
  changes: { title?: string; detail?: string },
) {
  const found = await owned(deps, token, id);
  if ("error" in found) return { ok: false, detail: found.error };
  const { task, path } = found;
  if (task.status === "done" || task.status === "cancelled" || attempted(task))
    return {
      ok: false,
      detail:
        "This task is finished, queued or has a build attempt. Use a correction amendment for a completed draft; its scope and history cannot be overwritten.",
    };
  if (
    (changes.title === undefined && changes.detail === undefined) ||
    (changes.title !== undefined && (!changes.title.trim() || changes.title.length > 300)) ||
    (changes.detail !== undefined && changes.detail.length > 2000)
  )
    return {
      ok: false,
      detail:
        "Supply a title (1–300 characters) or detail (up to 2000 characters). Nothing was truncated.",
    };
  const patch = {
    ...(changes.title !== undefined ? { title: changes.title.trim() } : {}),
    ...(changes.detail !== undefined ? { detail: changes.detail } : {}),
    updated_at: new Date().toISOString(),
  };
  const saved = await deps.workbench.rest<ManagerTask[]>(
    token,
    "PATCH",
    `${path}&updated_at=eq.${encodeURIComponent(task.updated_at)}&evidence=eq.${encodeURIComponent(task.evidence)}&status=eq.${task.status}`,
    patch,
  );
  const row = saved.ok ? firstRow<ManagerTask>(saved.data) : null;
  if (!row || row.id !== id || row.owner_id !== found.ownerId)
    return {
      ok: false,
      detail: "The task changed or its edit could not be confirmed. Read it again before editing.",
    };
  await deps.workbench
    .rest(token, "POST", "rpc/log_manager_change", {
      _owner_id: found.ownerId,
      _action: "task.update",
      _entity: "manager_tasks",
      _entity_id: id,
      _before: { title: task.title, detail: task.detail },
      _after: { title: row.title, detail: row.detail },
    })
    .catch(() => undefined);
  return { ok: true, detail: `Updated existing task ${id}. No build was started.` };
}

/** A deterministic child task gives each correction its own execution claim.
 * Never clear the parent's receipt or retry an uncertain child submission. */
export async function submitTaskCorrectionWith(
  deps: TaskExecutionDeps,
  token: string,
  id: string,
  correction: string,
  builder: OfficeBuilder,
) {
  const found = await owned(deps, token, id);
  if ("error" in found) return { ok: false, detail: found.error };
  const parent = found.task;
  const execution = readExecution(parent.evidence);
  if (!execution?.runId || execution.state !== "success" || parent.status === "cancelled")
    return {
      ok: false,
      detail:
        "Corrections require a recorded successful draft build. Check task execution first; uncertain or active builds cannot be amended.",
    };
  if (builder !== execution.builder)
    return {
      ok: false,
      detail: "Use the builder recorded on the original draft; no builder switch was made.",
    };
  if (!correction.trim() || correction.length > 2000)
    return { ok: false, detail: "Supply corrections of 1–2000 characters. Nothing was truncated." };
  const key = sha256Hex(JSON.stringify([found.ownerId, id, execution.attempt, correction]));
  const amendmentId = `${key.slice(0, 8)}-${key.slice(8, 12)}-5${key.slice(13, 16)}-a${key.slice(17, 20)}-${key.slice(20, 32)}`;
  const path = `manager_tasks?id=eq.${amendmentId}&owner_id=eq.${encodeURIComponent(found.ownerId)}`;
  const read = await deps.workbench.rest<ManagerTask[]>(token, "GET", path);
  if (!read.ok || !Array.isArray(read.data))
    return { ok: false, detail: "Amendment lookup unavailable. Nothing was submitted." };
  const marker = `Amendment of task ${id}, build ${execution.runId}. Correction key ${key}.`;
  const detail = `${parent.detail}\n\n${marker}\nCorrections:\n${correction}`;
  if (`${parent.title}\n${detail}`.length > 6000)
    return {
      ok: false,
      detail:
        "Combined requirements exceed the existing builder limit. Nothing was truncated or submitted.",
    };
  let child = firstRow<ManagerTask>(read.data);
  if (!child) {
    // Explicit ID and no upsert: duplicate/racing inserts cannot erase a claim.
    const created = await deps.workbench.rest<ManagerTask[]>(token, "POST", "manager_tasks", {
      id: amendmentId,
      owner_id: found.ownerId,
      title: parent.title,
      detail,
      risk: parent.risk,
      ...(parent.project ? { project: parent.project } : {}),
      status: "open",
      evidence: "",
      result: "",
    });
    child = created.ok ? firstRow<ManagerTask>(created.data) : null;
    if (!child)
      return {
        ok: false,
        detail: `Amendment ${amendmentId} save was not confirmed. Retry only these identical corrections to recover its receipt; no build was sent by this call.`,
      };
  }
  if (
    child.owner_id !== found.ownerId ||
    child.id !== amendmentId ||
    child.detail !== detail ||
    child.title !== parent.title ||
    child.risk !== parent.risk ||
    child.project !== parent.project
  )
    return { ok: false, detail: "Amendment content did not match. Nothing was submitted." };
  const receipt = readExecution(child.evidence);
  if (attempted(child))
    return {
      ok: !!receipt?.runId,
      detail: `Amendment receipt ${amendmentId}; original task ${id}.${receipt?.runId ? ` Build ${receipt.runId} (${receipt.state}).` : " Submission is uncertain; inspect Build & Testing."} Nothing was resubmitted.`,
    };
  const result = await executeTaskWith(deps, token, amendmentId, false, builder);
  return {
    ...result,
    detail: `Amendment receipt ${amendmentId}; original task ${id}. ${result.detail}${result.runs?.length ? " " + result.runs.map((run) => `Build ${run.id} (${run.state}): ${run.url}`).join("; ") : ""}`,
  };
}
