/** Existing-task execution through a fixed Office builder (Codex or Claude). No background loop. */
import type { CodexBuildResult } from './codex-builds.server';
import { firstRow, classifyManagerRisk, type ManagerTask, type WorkbenchDeps } from './manager-work.functions';
import { looksLikeOfficeCodeChange, shouldHandOffToCodex, officeBuildProtectedCategory } from './codex-task-handoff';
import { BUILDER_LABEL, type OfficeBuilder } from './builder-choice';
import { splitLeadingJson } from './task-receipt';
import { ACTIVE_RUN_STATES, MAX_QUEUED_PER_BUILDER, hasQueueMarker, queueMarker, queuedTasksFor, selectElsieQueueTask } from './elsie-task-queue';
import { AUTOPILOT_NOTE_ID, autopilotCommand, autopilotDetail, parseAutopilot, type AutopilotMode } from './autopilot';
import { FAILED_RUN_STATES, hasTakeover, newTakeoverNoteDetail, parseTakeoverNote, takeoverMarker, takeoverNoteId, takeoverStatusText, type ChangeState, type TakeoverReason } from './claude-takeover';

type BuildFn = (token: string, request?: string, prNumber?: number, runId?: number) => Promise<CodexBuildResult>;
interface Execution { kind: 'codex-task-v1' | 'office-task-v2'; builder: OfficeBuilder; attempt: string; runId?: number; state: string; prior: string; }
export interface TaskExecutionDeps {
  workbench: WorkbenchDeps;
  /** Codex builder (default). */
  build: BuildFn;
  /** Claude builder; only used when John explicitly chose Claude. */
  buildClaude?: BuildFn;
  /** Read-only live state of a full Claude worker's pull request. */
  readChange?: (prNumber: number) => Promise<ChangeState | null>;
}
/** Legacy codex-task-v1 receipts are always Codex. */
export const readExecution = (text: string): Execution | null => {
  try {
    // Relay notes may follow the receipt; read the leading object only.
    const x = JSON.parse(splitLeadingJson(text).json ?? text);
    if (x?.kind === 'codex-task-v1') return { ...x, builder: 'codex' };
    if (x?.kind === 'office-task-v2' && (x.builder === 'codex' || x.builder === 'claude')) return x;
    return null;
  } catch { return null; }
};

export async function executeTaskWith(deps: TaskExecutionDeps, token: string, taskId: string, checkOnly = false, builder?: OfficeBuilder, preclaimed = false): Promise<CodexBuildResult> {
  const owner = await deps.workbench.verifyOwner(token);
  if (!owner.ok) return { ok: false, detail: owner.message };
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) return { ok: false, detail: 'Choose a saved task identifier.' };
  const path = `manager_tasks?id=eq.${encodeURIComponent(taskId)}&owner_id=eq.${encodeURIComponent(owner.userId)}`;
  const read = await deps.workbench.rest<ManagerTask[]>(token, 'GET', path);
  const task = firstRow<ManagerTask>(read.data);
  if (!read.ok || !task || task.owner_id !== owner.userId) return { ok: false, detail: 'The saved task could not be read for this owner.' };
  const execution = readExecution(task.evidence);
  if (preclaimed && !task.evidence.includes('[elsie-claim ' + builder + ' ' + taskId + ']')) return { ok: false, detail: 'Missing queued claim receipt.' };
  const pick = (b: OfficeBuilder): BuildFn | undefined => b === 'claude' ? deps.buildClaude : deps.build;
  if (checkOnly) {
    // A job handed to a full Claude worker reports Claude's progress, never the old small-builder run.
    if (hasTakeover(task.evidence)) return takeoverStatusWith(deps, token, owner.userId, task.id);
    if (!execution?.runId) return { ok: false, detail: 'This task has no verified build link. Assignment alone does not start work. If a previous submission was uncertain, inspect Build & Testing before retrying.' };
    if (builder && builder !== execution.builder) return { ok: false, detail: `This task was sent to ${BUILDER_LABEL[execution.builder]}, not ${BUILDER_LABEL[builder]}. Its status is checked only with the recorded builder.` };
    const run = pick(execution.builder);
    if (!run) return { ok: false, detail: `${BUILDER_LABEL[execution.builder]} status is not available on this server path.` };
    const live = await run(token, undefined, undefined, execution.runId);
    if (!live.ok) return live;
    const state = live.runs?.find(r => r.id === execution.runId)?.state;
    if (!state) return { ok: false, detail: 'No matching run evidence returned. Task status was left unchanged.' };
    const active = ['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(state);
    // Successful candidates await review, not a claim that the Office changed.
    const saved = await deps.workbench.rest<ManagerTask[]>(token, 'PATCH', `${path}&evidence=eq.${encodeURIComponent(task.evidence)}&status=not.in.(done,cancelled)`, {
      status: active ? 'in_progress' : 'open', result: live.detail.slice(0, 2000),
      evidence: JSON.stringify({ ...execution, state }) + splitLeadingJson(task.evidence).tail, updated_at: new Date().toISOString(),
    });
    const checked = { ...live, detail: live.detail + (saved.ok && firstRow(saved.data) ? ' Task evidence updated; completion remains unverified.' : ' Task record was not updated; it may have changed during this check.') };
    // 21 Oct: a failed small Claude build goes to a full Claude worker at once,
    // instead of John hearing "failure" and asking for paid re-runs.
    if (execution.builder === 'claude' && FAILED_RUN_STATES.has(state) && saved.ok && firstRow(saved.data)) {
      const handed = await handTaskToClaudeWith(deps, token, task.id, 'after-failure', `run ${execution.runId}: ${state}`)
        .catch((): CodexBuildResult => ({ ok: false, detail: 'Handing it to a full Claude worker did not go through; ask me to give it to Claude.' }));
      return { ...checked, detail: `The small Claude builder could not finish this (run ${execution.runId}: ${state}). ${handed.detail}` };
    }
    return checked;
  }
  if (task.status === 'done' || task.status === 'cancelled') return { ok: false, detail: 'That task is already finished; nothing was started.' };
  if (execution && builder && execution.builder !== builder) return { ok: false, detail: `A build attempt was already recorded with ${BUILDER_LABEL[execution.builder]}. It was not sent to ${BUILDER_LABEL[builder]}; check the existing attempt instead.` };
  if (execution || /(?:Codex|Claude) handoff|"kind"\s*:\s*"(?:office-task-v2|codex-task-v1)"/i.test(task.evidence)) return { ok: false, detail: 'A build submission was already recorded for this task. Check its execution instead; it was not submitted again.' };
  const chosen: OfficeBuilder = builder ?? 'codex';
  const run = pick(chosen);
  if (!run) return { ok: false, detail: `${BUILDER_LABEL[chosen]} builds are not available on this server path; nothing was sent.` };
  const request = `${task.title}\n${task.detail}`.trim();
  if ((task.project && task.project.toLowerCase() !== 'canx office') || !shouldHandOffToCodex({
    codeChange: looksLikeOfficeCodeChange(request), taskRisk: task.risk,
    classifiedRisk: classifyManagerRisk(`start_${chosen}_build`, request),
    protectedCategory: officeBuildProtectedCategory(request), alreadySubmitted: false,
  })) return { ok: false, detail: 'This executor supports green CanX Office code changes only. This task needs its appropriate tool or approval; assigning a room does not execute it.' };
  const pending: Execution = { kind: 'office-task-v2', builder: chosen, attempt: crypto.randomUUID(), state: 'submission_unconfirmed', prior: task.evidence.slice(0, 700) };
  // Compare-and-set before dispatch prevents two conversations from executing
  // the same task. A lost response leaves the durable claim, never a retry.
  const claimText = JSON.stringify(pending);
  const claimed = await deps.workbench.rest<ManagerTask[]>(token, 'PATCH',
    path + '&updated_at=eq.' + encodeURIComponent(task.updated_at) +
    '&evidence=eq.' + encodeURIComponent(task.evidence) +
    (preclaimed ? '&status=eq.in_progress' : '&status=not.in.(done,cancelled)'), {
      evidence: claimText, result: 'Preparing one builder submission; execution not yet confirmed.',
      updated_at: new Date().toISOString(),
    });
  if (!claimed.ok || !firstRow(claimed.data)) return { ok: false, detail: 'Execution receipt could not be confirmed. No build sent.' };
  let live: CodexBuildResult;
  try { live = await run(token, request); }
  catch { live = { ok: false, detail: 'Submission could not be confirmed. Nothing was retried.' }; }
  const runId = live.runs?.[0]?.id;
  const linked = live.ok && Number.isSafeInteger(runId) && (runId ?? 0) > 0;
  const next: Execution = { ...pending, state: linked ? 'queued' : 'submission_unconfirmed', ...(linked && runId !== undefined ? { runId } : {}) };
  const saved = await deps.workbench.rest<ManagerTask[]>(token, 'PATCH', `${path}&evidence=eq.${encodeURIComponent(claimText)}&status=not.in.(done,cancelled)`, {
    status: linked ? 'in_progress' : 'open', evidence: JSON.stringify(next), result: live.detail.slice(0, 2000), updated_at: new Date().toISOString(),
  });
  await deps.workbench.rest(token, 'POST', 'rpc/log_manager_change', {
    _owner_id: owner.userId, _action: 'task.execute', _entity: 'manager_tasks', _entity_id: task.id,
    _before: { status: task.status }, _after: { attempt: pending.attempt, builder: chosen, state: next.state, run_id: runId ?? null },
  }).catch(() => undefined);
  return { ...live, detail: live.detail + (saved.ok && firstRow(saved.data) ? ' Execution evidence saved on the task.' : ' Execution evidence could not be saved; check Build & Testing before any further submission.') };
}

/** Explicit, owner-authorized queued task release; never a background scheduler.
 * Uses the scoped SQL claim before the existing idempotent execution path.
 * Do not invoke while a builder is running or until the claim migration is live.
 */
export async function executeQueuedElsieTaskWith(
  deps: TaskExecutionDeps, token: string, taskId: string, builder: OfficeBuilder,
  builderIdleVerified: boolean
): Promise<CodexBuildResult> {
  if (!builderIdleVerified) return { ok: false, detail: 'Builder idle status unverified; queued work retained.' };
  const owner = await deps.workbench.verifyOwner(token);
  if (!owner.ok) return { ok: false, detail: owner.message };
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) return { ok: false, detail: 'Invalid queued task id.' };
  // Re-check owner and available evidence rather than trusting a client queue.
  const data = await deps.workbench.rest<{ ok: boolean; reason?: string }>(
    token, 'POST', 'rpc/canx_mcp_claim_elsie_task', { _task_id: taskId, _builder: builder }
  );
  if (!data.ok || !data.data?.ok)
    return { ok: false, detail: 'Scoped claim not confirmed: ' + (data.data?.reason ?? data.error ?? 'unavailable') + '. No build was sent.' };
  const result = await executeTaskWith(deps, token, taskId, false, builder, true);
  if (!result.ok) await parkUnsentClaim(deps, token, owner.userId, taskId, builder, result.detail);
  // Sent: the "queued" note no longer describes the task. Best effort; the receipt is already saved.
  else await deps.workbench.rest(token, 'PATCH', `manager_tasks?id=eq.${encodeURIComponent(taskId)}&owner_id=eq.${encodeURIComponent(owner.userId)}`, { waiting_reason: '' }).catch(() => undefined);
  return result;
}

/** A claim whose task was refused before any submission receipt was written
 * would otherwise hold the builder "busy" forever. Park it as waiting with the
 * reason, only while it still carries just the claim (never after a send).
 */
async function parkUnsentClaim(deps: TaskExecutionDeps, token: string, ownerId: string, taskId: string, builder: OfficeBuilder, reason: string) {
  const path = `manager_tasks?id=eq.${encodeURIComponent(taskId)}&owner_id=eq.${encodeURIComponent(ownerId)}`;
  const read = await deps.workbench.rest<ManagerTask[]>(token, 'GET', path).catch(() => null);
  const task = read?.ok ? firstRow<ManagerTask>(read.data) : null;
  if (!task || task.status !== 'in_progress' || readExecution(task.evidence) || !task.evidence.includes(`[elsie-claim ${builder} ${taskId}]`)) return;
  await deps.workbench.rest(token, 'PATCH', `${path}&status=eq.in_progress&evidence=eq.${encodeURIComponent(task.evidence)}`, {
    status: 'waiting', waiting_reason: `Queued release stopped before sending: ${reason}`.slice(0, 500), updated_at: new Date().toISOString(),
  }).catch(() => undefined);
}

type QueueTask = Pick<ManagerTask, 'id' | 'title' | 'detail' | 'status' | 'risk' | 'worker' | 'evidence' | 'created_at' | 'updated_at' | 'owner_id'>;

async function builderTasks(deps: TaskExecutionDeps, token: string, ownerId: string, builder: OfficeBuilder): Promise<QueueTask[] | null> {
  const read = await deps.workbench.rest<QueueTask[]>(token, 'GET',
    `manager_tasks?owner_id=eq.${encodeURIComponent(ownerId)}&worker=ilike.${builder}&status=in.(open,in_progress,waiting)&order=created_at.asc&limit=100`);
  return read.ok && Array.isArray(read.data) ? read.data : null;
}

/** Live builder availability: idle only when the run list is readable and no run is active. */
export async function builderAvailability(deps: TaskExecutionDeps, token: string, builder: OfficeBuilder): Promise<{ idle: boolean; detail: string }> {
  const run = builder === 'claude' ? deps.buildClaude : deps.build;
  if (!run) return { idle: false, detail: `${BUILDER_LABEL[builder]} status is not available on this server path.` };
  const status = await run(token).catch(() => null);
  if (!status?.ok || !Array.isArray(status.runs)) return { idle: false, detail: `${BUILDER_LABEL[builder]} status could not be read.` };
  const active = status.runs.find(r => ACTIVE_RUN_STATES.has(String(r.state)));
  return active ? { idle: false, detail: `${BUILDER_LABEL[builder]} is working on run ${active.id} (${active.state}).` } : { idle: true, detail: `${BUILDER_LABEL[builder]} has no active run.` };
}

/** Whether a new handoff must wait: John asked to queue it, the builder is busy or
 * unreadable, Elsie already has linked work for it, or earlier tasks are queued.
 */
export async function handoffMustQueue(deps: TaskExecutionDeps, token: string, builder: OfficeBuilder, askedToQueue: boolean): Promise<{ queue: boolean; reason: string }> {
  if (askedToQueue) return { queue: true, reason: 'You asked to queue it.' };
  const owner = await deps.workbench.verifyOwner(token);
  if (!owner.ok) return { queue: true, reason: owner.message };
  const tasks = await builderTasks(deps, token, owner.userId, builder);
  if (!tasks) return { queue: true, reason: 'The saved queue could not be read.' };
  if (tasks.some(t => t.status === 'in_progress')) return { queue: true, reason: `${BUILDER_LABEL[builder]} already has a task in progress.` };
  if (queuedTasksFor(tasks, builder).length) return { queue: true, reason: `Earlier ${BUILDER_LABEL[builder]} tasks are waiting first.` };
  const availability = await builderAvailability(deps, token, builder);
  return availability.idle ? { queue: false, reason: availability.detail } : { queue: true, reason: availability.detail };
}

/** Save John's explicit handoff in the builder's durable queue without sending it.
 * The marker is the standing authorization for a later automatic release.
 */
export async function queueTaskForBuilderWith(deps: TaskExecutionDeps, token: string, taskId: string, builder: OfficeBuilder): Promise<{ ok: boolean; position?: number; detail: string }> {
  const owner = await deps.workbench.verifyOwner(token);
  if (!owner.ok) return { ok: false, detail: owner.message };
  const tasks = await builderTasks(deps, token, owner.userId, builder);
  if (!tasks) return { ok: false, detail: 'The saved queue could not be read, so the task was saved but not queued.' };
  const waiting = queuedTasksFor(tasks, builder).filter(t => t.id !== taskId);
  if (waiting.length >= MAX_QUEUED_PER_BUILDER) return { ok: false, detail: `${BUILDER_LABEL[builder]} already has ${waiting.length} queued tasks (the limit). The task was saved but not queued.` };
  const path = `manager_tasks?id=eq.${encodeURIComponent(taskId)}&owner_id=eq.${encodeURIComponent(owner.userId)}`;
  const read = await deps.workbench.rest<ManagerTask[]>(token, 'GET', path);
  const task = read.ok ? firstRow<ManagerTask>(read.data) : null;
  if (!task) return { ok: false, detail: 'The saved task could not be read for this owner.' };
  if (task.status !== 'open' || task.risk !== 'green') return { ok: false, detail: 'Only open green tasks can be queued.' };
  if (readExecution(task.evidence) || /office-task-v2|codex-task-v1|(?:Claude|Codex) handoff|elsie-claim/i.test(task.evidence)) return { ok: false, detail: 'This task already has a build attempt, so it was not queued again.' };
  if (hasQueueMarker(task.evidence, builder)) return { ok: true, position: waiting.length + 1, detail: `Already queued for ${BUILDER_LABEL[builder]}.` };
  const evidence = (task.evidence ? task.evidence + '\n' : '') + queueMarker(builder, new Date().toISOString());
  const saved = await deps.workbench.rest<ManagerTask[]>(token, 'PATCH', `${path}&status=eq.open&evidence=eq.${encodeURIComponent(task.evidence)}`, {
    worker: BUILDER_LABEL[builder], evidence,
    waiting_reason: `Queued for ${BUILDER_LABEL[builder]}; starts automatically after earlier ${BUILDER_LABEL[builder]} work finishes.`,
    updated_at: new Date().toISOString(),
  });
  if (!saved.ok || !firstRow(saved.data)) return { ok: false, detail: 'The queue position could not be saved; nothing was sent.' };
  await deps.workbench.rest(token, 'POST', 'rpc/log_manager_change', {
    _owner_id: owner.userId, _action: 'task.queue', _entity: 'manager_tasks', _entity_id: taskId,
    _before: { evidence: task.evidence.slice(0, 200) }, _after: { queued_for: builder, position: waiting.length + 1 },
  }).catch(() => undefined);
  return { ok: true, position: waiting.length + 1, detail: `Queued for ${BUILDER_LABEL[builder]} at position ${waiting.length + 1}.` };
}

export interface QueueAdvance { builder: OfficeBuilder; checked: boolean; finished: string[]; started?: { taskId: string; title: string; detail: string; ok: boolean }; detail: string; }

/** One idempotent queue step for a builder, run inside an owner-authenticated request:
 * refresh linked runs, and when the builder is confirmed idle release exactly one
 * owner-queued task through the scoped claim. Does nothing (and makes no GitHub
 * call) when the builder has neither linked work nor queued tasks.
 */
export async function advanceElsieQueueWith(deps: TaskExecutionDeps, token: string, builder: OfficeBuilder): Promise<QueueAdvance> {
  const none = (detail: string, checked = false): QueueAdvance => ({ builder, checked, finished: [], detail });
  const owner = await deps.workbench.verifyOwner(token);
  if (!owner.ok) return none(owner.message);
  let tasks = await builderTasks(deps, token, owner.userId, builder);
  if (!tasks) return none('Saved queue could not be read.');
  const linked = tasks.filter(t => t.status === 'in_progress' && readExecution(t.evidence)?.runId);
  if (!linked.length && !queuedTasksFor(tasks, builder).length) return none(`No ${BUILDER_LABEL[builder]} queue work.`);
  const finished: string[] = [];
  for (const t of linked) {
    const check = await executeTaskWith(deps, token, t.id, true).catch(() => null);
    const state = check?.runs?.[0]?.state;
    if (check?.ok && state && !ACTIVE_RUN_STATES.has(state)) {
      const change = check.detail.match(/(?:Draft change|Change) #\d+[^:]*: \S+/)?.[0];
      const draftOnly = change?.startsWith('Draft change') ? ' Built as a draft only; it is not in the Office until it is merged and published.' : '';
      if (/Handed to a full Claude worker/.test(check.detail)) finished.push(`"${t.title}": the small builder could not finish it (${state}), so a full Claude worker has it now. No re-run is needed.`);
      else finished.push(`"${t.title}" finished: ${state}.${change ? ' ' + change : ''}${draftOnly}`);
    }
  }
  if (finished.length) tasks = await builderTasks(deps, token, owner.userId, builder);
  if (!tasks) return { builder, checked: true, finished, detail: 'Saved queue could not be re-read after the status check.' };
  const availability = await builderAvailability(deps, token, builder);
  const selection = selectElsieQueueTask(tasks, builder, availability.idle);
  if (selection.state !== 'ready') {
    const waiting = queuedTasksFor(tasks, builder).length;
    const why = selection.state === 'blocked' ? (availability.idle ? selection.reason : availability.detail) : 'nothing queued';
    return { builder, checked: true, finished, detail: `${BUILDER_LABEL[builder]} queue: ${waiting} waiting; not released (${why}).` };
  }
  const task = tasks.find(t => t.id === selection.task.id)!;
  const outcome = await executeQueuedElsieTaskWith(deps, token, task.id, builder, true);
  const run = outcome.runs?.[0];
  return { builder, checked: true, finished,
    started: { taskId: task.id, title: task.title, ok: outcome.ok, detail: outcome.detail + (run ? ` Run ${run.id}: ${run.url}` : '') },
    detail: outcome.ok ? `Started queued ${BUILDER_LABEL[builder]} task "${task.title}".` : `Queued ${BUILDER_LABEL[builder]} task "${task.title}" was not started: ${outcome.detail}` };
}

/** Hand one saved green Office task to a full Claude worker. Writes the Brain
 * note first, then marks the task; never starts a paid builder run.
 */
export async function handTaskToClaudeWith(deps: TaskExecutionDeps, token: string, taskId: string, reason: TakeoverReason, failedRun?: string): Promise<CodexBuildResult> {
  const owner = await deps.workbench.verifyOwner(token);
  if (!owner.ok) return { ok: false, detail: owner.message };
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) return { ok: false, detail: 'Choose a saved task identifier.' };
  const path = `manager_tasks?id=eq.${encodeURIComponent(taskId)}&owner_id=eq.${encodeURIComponent(owner.userId)}`;
  const read = await deps.workbench.rest<ManagerTask[]>(token, 'GET', path);
  const task = read.ok ? firstRow<ManagerTask>(read.data) : null;
  if (!task || task.owner_id !== owner.userId) return { ok: false, detail: 'The saved task could not be read for this owner.' };
  if (task.status === 'done' || task.status === 'cancelled') return { ok: false, detail: 'That task is already finished; nothing was handed over.' };
  if (hasTakeover(task.evidence)) return takeoverStatusWith(deps, token, owner.userId, task.id);
  const scope = `${task.title}\n${task.detail}`;
  if ((task.project && task.project.toLowerCase() !== 'canx office') || task.risk !== 'green' || officeBuildProtectedCategory(scope))
    return { ok: false, detail: 'Only green CanX Office code tasks can be handed to a Claude worker. This one needs John\'s approval path; nothing was handed over.' };
  const execution = readExecution(task.evidence);
  if (execution?.runId && ACTIVE_RUN_STATES.has(execution.state))
    return { ok: false, detail: `The small builder is still on run ${execution.runId}. Check it first; nothing was handed over.` };
  const at = new Date().toISOString();
  const noteId = takeoverNoteId(task.id);
  const notePath = `office_notes?id=eq.${encodeURIComponent(noteId)}&owner_id=eq.${encodeURIComponent(owner.userId)}&select=id&limit=1`;
  const existing = await deps.workbench.rest<{ id: string }[]>(token, 'GET', notePath);
  if (!existing.ok || !Array.isArray(existing.data)) return { ok: false, detail: 'The Brain could not be checked for a Claude handoff note; nothing was handed over.' };
  if (!existing.data.length) {
    const note = await deps.workbench.rest(token, 'POST', 'office_notes', {
      id: noteId, owner_id: owner.userId, kind: 'decision', owner_name: '', provenance: 'ai-proposal', source: 'Elsie handoff to Claude',
      title: `Claude takeover: ${task.title}`.slice(0, 200),
      detail: newTakeoverNoteDetail({ taskId: task.id, reason, at, title: task.title, detail: task.detail, ...(failedRun ? { failedRun } : {}) }),
    });
    if (!note.ok) return { ok: false, detail: 'Claude\'s handoff note could not be saved in the Brain; nothing was handed over.' };
  }
  const saved = await deps.workbench.rest<ManagerTask[]>(token, 'PATCH', `${path}&evidence=eq.${encodeURIComponent(task.evidence)}&status=not.in.(done,cancelled)`, {
    status: 'waiting', worker: 'Claude', evidence: (task.evidence ? task.evidence + '\n' : '') + takeoverMarker(at, reason),
    waiting_reason: `With a full Claude worker (Brain note ${noteId}). Claude picks up handed-over jobs about every hour.`,
    updated_at: at,
  });
  if (!saved.ok || !firstRow(saved.data)) return { ok: false, detail: 'The task changed while it was being handed over; nothing was handed over. Check it again.' };
  await deps.workbench.rest(token, 'POST', 'rpc/log_manager_change', {
    _owner_id: owner.userId, _action: 'task.claude_takeover', _entity: 'manager_tasks', _entity_id: task.id,
    _before: { status: task.status, worker: task.worker }, _after: { reason, note: noteId },
  }).catch(() => undefined);
  return { ok: true, detail: 'Handed to a full Claude worker; no paid re-run was started. Claude picks it up within about an hour, builds it with tests, and its change merges itself once checks pass. Ask me for its status any time.' };
}

/** Claude's real progress on a handed-over task: its Brain note, then the live PR when it names one. */
export async function takeoverStatusWith(deps: TaskExecutionDeps, token: string, ownerId: string, taskId: string): Promise<CodexBuildResult> {
  const noteId = takeoverNoteId(taskId);
  const read = await deps.workbench.rest<{ detail: string }[]>(token, 'GET',
    `office_notes?id=eq.${encodeURIComponent(noteId)}&owner_id=eq.${encodeURIComponent(ownerId)}&select=detail&limit=1`).catch(() => null);
  const note = read?.ok ? parseTakeoverNote(firstRow<{ detail: string }>(read.data)?.detail) : null;
  const change = note?.pr && deps.readChange ? await deps.readChange(note.pr).catch(() => null) : null;
  return { ok: !!note, detail: takeoverStatusText(note, change) };
}

export interface AutopilotStep { mode: AutopilotMode; changed: boolean; detail: string }

/** Reads the Office autopilot switch and flips it when John's own words say stop or resume.
 * Writes only the one Brain note; never starts, cancels or deletes any work. */
export async function autopilotStepWith(workbench: TaskExecutionDeps['workbench'], token: string, request: string): Promise<AutopilotStep> {
  const owner = await workbench.verifyOwner(token);
  if (!owner.ok) return { mode: 'on', changed: false, detail: owner.message };
  const path = `office_notes?id=eq.${encodeURIComponent(AUTOPILOT_NOTE_ID)}&owner_id=eq.${encodeURIComponent(owner.userId)}`;
  const read = await workbench.rest<{ detail: string }[]>(token, 'GET', `${path}&select=detail&limit=1`);
  if (!read.ok || !Array.isArray(read.data)) return { mode: 'on', changed: false, detail: 'The autopilot switch could not be read.' };
  const current = parseAutopilot(firstRow<{ detail: string }>(read.data)?.detail);
  const wanted = autopilotCommand(request);
  if (!wanted || wanted === current.mode) {
    return { mode: current.mode, changed: false, detail: current.mode === 'stopped' ? 'Autopilot is stopped: queued work waits until John says resume.' : 'Autopilot is on.' };
  }
  const at = new Date().toISOString();
  const body = { title: `Office autopilot: ${wanted}`, detail: autopilotDetail(wanted, at, 'Elsie for John', request), updated_at: at };
  const saved = read.data.length
    ? await workbench.rest(token, 'PATCH', path, body)
    : await workbench.rest(token, 'POST', 'office_notes', { id: AUTOPILOT_NOTE_ID, owner_id: owner.userId, kind: 'decision', owner_name: '', provenance: 'john', source: 'John via Elsie', ...body });
  if (!saved.ok) return { mode: current.mode, changed: false, detail: 'The autopilot switch could not be saved; nothing changed.' };
  return {
    mode: wanted, changed: true,
    detail: wanted === 'stopped'
      ? 'Autopilot stopped. Nothing new starts on its own: Elsie\'s queue and the hourly Claude worker wait until you say resume. Work already running finishes its current step.'
      : 'Autopilot back on. Queued jobs and Claude\'s handed-over jobs keep moving; money, security, sign-in, database and legal changes still wait for you.',
  };
}
