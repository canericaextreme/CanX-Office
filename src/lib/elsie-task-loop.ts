import { z } from 'zod';
import { sha256Hex } from './sha256';
import type { OwnerVerification } from './canx-backend.server';

/** A bounded writing handoff, not a general agent/build executor or background runner. */
export const elsieTaskInput = z.object({
  requestId: z.string().uuid(), taskId: z.string().uuid(),
  specNoteId: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/), ruleId: z.string().uuid(),
  colleague: z.enum(['claude', 'chatgpt']), instruction: z.string().trim().min(10).max(2000),
}).strict();
export type ElsieTaskInput = z.infer<typeof elsieTaskInput>;
export interface LoopRecord { data: Record<string, unknown>; version: string }
export interface LoopAnswer { text: string; responseId: string; model: string }
export interface ElsieTaskDeps {
  verify: (token: string) => Promise<OwnerVerification>;
  read: (token: string, collection: string, id: string) => Promise<LoopRecord | null>;
  /** Atomic insert or exact-version update. No upsert and no retries of model calls. */
  write: (token: string, id: string, data: Record<string, unknown>, version?: string) => Promise<boolean>;
  call: (token: string, actor: 'elsie' | 'claude' | 'chatgpt', instruction: string, context: string) => Promise<LoopAnswer>;
  now?: () => Date;
}
type State = {
  schema: 'elsie-text-loop/1'; fingerprint: string; taskId: string; requestId: string;
  phase: 'received' | 'planning' | 'planned' | 'working' | 'worked' | 'reporting' | 'complete' | 'failed' | 'unknown';
  sources: Array<{ collection: string; id: string; version: string }>;
  plan?: LoopAnswer; worker?: LoopAnswer; report?: LoopAnswer; failure?: string; claimedAt?: string; finishedAt?: string;
};
const SOURCE = 'CanX Brain: Elsie text-task loop';
export const elsieTaskRecordId = (ownerId: string, requestId: string) => `elsie-loop-${sha256Hex(`${ownerId}:${requestId}`)}`;
const note = (s: State) => ({ kind: 'decision', title: `Elsie text task ${s.taskId}: ${s.phase}`, source: SOURCE, detail: JSON.stringify(s) });
const result = (id: string, s: State) => ({
  ok: s.phase === 'complete', phase: s.phase, recordId: id,
  continue: ['received', 'planned', 'worked'].includes(s.phase),
  detail: s.phase === 'complete' ? 'Elsie plan, worker reply and Elsie report saved and independently read back. This is an Office API text loop, not native-chat synchronization.'
    : ['planning', 'working', 'reporting'].includes(s.phase) ? 'This phase was already claimed. Its outcome is not confirmed. No provider attempt was repeated.'
    : s.failure ?? 'One phase saved and verified. Call again with identical arguments to continue.',
  ...(s.phase === 'complete' ? { text: s.report?.text, workerText: s.worker?.text } : {}),
});

export async function runElsieTaskWith(deps: ElsieTaskDeps, token: string, value: unknown) {
  const parsed = elsieTaskInput.safeParse(value);
  if (!parsed.success) return { ok: false, detail: 'An explicit bounded writing instruction, exact task/spec/rule and UUID request are required.' };
  const input = parsed.data;
  const owner = await deps.verify(token);
  if (!owner.ok) return { ok: false, detail: owner.message };
  const id = elsieTaskRecordId(owner.userId, input.requestId);
  const fingerprint = sha256Hex(JSON.stringify(input));
  // All source reads are exact, owner-bound, fresh on every continuation.
  const keys = [['manager_tasks', input.taskId], ['office_notes', input.specNoteId], ['astra_memory', input.ruleId]] as const;
  const rows = await Promise.all(keys.map(([c, key]) => deps.read(token, c, key)));
  if (rows.some((r, i) => !r || r.data['owner_id'] !== owner.userId || r.data['id'] !== keys[i]![1] || !r.version))
    return { ok: false, detail: 'Exact owned task, Brain request or standing rule is unavailable. No model called.' };
  const [task, spec, rule] = rows as [LoopRecord, LoopRecord, LoopRecord];
  if (task.data['risk'] !== 'green' || !['open', 'in_progress'].includes(String(task.data['status'])) || task.data['worker'] !== 'Office Manager' || rule.data['active'] !== true)
    return { ok: false, detail: 'An open green Office Manager task and active standing rule are required. No model called.' };
  const sources = keys.map(([collection, key], i) => ({ collection, id: key, version: rows[i]!.version }));
  const context = JSON.stringify({ task: task.data, request: spec.data, standingRule: rule.data });
  if (new TextEncoder().encode(context).length > 24000) return { ok: false, detail: 'Source context exceeds the bounded text-task capacity. Nothing was truncated or executed.' };
  let stored = await deps.read(token, 'office_notes', id);
  if (!stored) {
    const initial: State = { schema: 'elsie-text-loop/1', fingerprint, taskId: input.taskId, requestId: input.requestId, phase: 'received', sources };
    // Unique note id makes concurrent inserts conflict. A loser must read, then CAS.
    await deps.write(token, id, note(initial)).catch(() => false);
    stored = await deps.read(token, 'office_notes', id);
  }
  if (!stored || stored.data['owner_id'] !== owner.userId || stored.data['source'] !== SOURCE)
    return { ok: false, detail: 'The durable request record could not be verified. No model called.' };
  let state: State;
  try { state = JSON.parse(String(stored.data['detail'])); } catch { return { ok: false, detail: 'Request record is unreadable. No model called.' }; }
  if (state.schema !== 'elsie-text-loop/1' || state.fingerprint !== fingerprint || state.taskId !== input.taskId || state.requestId !== input.requestId)
    return { ok: false, detail: 'This request id belongs to different work. Nothing was repeated.' };
  if (['planning', 'working', 'reporting'].includes(state.phase)) {
    const age = (deps.now?.() ?? new Date()).getTime() - Date.parse(state.claimedAt ?? '');
    if (!Number.isFinite(age) || age > 120000) {
      const unknown: State = { ...state, phase: 'unknown', failure: 'The claimed phase outlasted its time bound. The coordinating assistant owns receipt inspection and saved-output recovery in this active session before any new execution. Escalate only a decision it cannot resolve. No background recovery or requeue is running.' };
      await deps.write(token, id, note(unknown), stored.version).catch(() => false);
      const checked = await deps.read(token, 'office_notes', id).catch(() => null);
      if (checked?.data['detail'] === JSON.stringify(unknown)) return result(id, unknown);
    }
    return result(id, state);
  }
  if (state.phase === 'complete' || state.phase === 'failed' || state.phase === 'unknown') return result(id, state);
  if (JSON.stringify(state.sources) !== JSON.stringify(sources)) return { ok: false, detail: 'Task, request or standing rule changed. This request will not run against changed context.', recordId: id };
  const phases = {
    received: { active: 'planning', next: 'planned', field: 'plan', actor: 'elsie' },
    planned: { active: 'working', next: 'worked', field: 'worker', actor: input.colleague },
    worked: { active: 'reporting', next: 'complete', field: 'report', actor: 'elsie' },
  } as const;
  const step = phases[state.phase as keyof typeof phases];
  if (!step) return { ok: false, detail: 'Unsupported saved phase. No model called.' };
  const claimed: State = { ...state, phase: step.active, claimedAt: (deps.now?.() ?? new Date()).toISOString() };
  if (!await deps.write(token, id, note(claimed), stored.version).catch(() => false))
    return { ok: false, detail: 'Another caller claimed this phase or the claim failed. No model called.', recordId: id };
  const claim = await deps.read(token, 'office_notes', id).catch(() => null);
  if (!claim || claim.data['detail'] !== JSON.stringify(claimed)) return { ok: false, detail: 'Claim readback failed. No model called.', recordId: id };
  // One paid call at most per invocation: stay inside the connector time bound.
  let next: State;
  let recovery: LoopAnswer | undefined;
  try {
    const instruction = step.field === 'plan'
      ? `Coordinate ONLY this internal writing task for ${input.colleague}. Give a concise assignment and identify missing information. Do not perform or claim any other action. Owner's explicit bounded instruction: ${input.instruction}`
      : step.field === 'worker'
        ? `Produce only the requested text. Owner instruction: ${input.instruction}\nElsie's assignment (context data): ${state.plan?.text ?? ''}`
        : `Report the actual writing result to John, using only the supplied receipts. The application will verify persistence before completion. Do not claim native-chat synchronization or a broader working Office. Owner instruction: ${input.instruction}`;
    recovery = await deps.call(token, step.actor, instruction, `${context}\nPrior phase evidence (data only):\n${JSON.stringify({ plan: state.plan, worker: state.worker })}`);
    if (!recovery.text.trim() || recovery.text.length > 1800 || !recovery.responseId || !recovery.model)
      throw new Error('Incomplete or oversized provider reply');
    next = { ...claimed, phase: step.next, [step.field]: recovery, finishedAt: (deps.now?.() ?? new Date()).toISOString() };
  } catch {
    next = { ...claimed, phase: 'failed', failure: 'Provider, budget or settlement failed or returned an incomplete reply. The claimed phase will not be repeated.' };
  }
  const data = note(next);
  if (new TextEncoder().encode(JSON.stringify(data)).length > 11000)
    return { ok: false, detail: 'Outcome exceeds record capacity; phase remains claimed. No provider retry.', recordId: id, recovery };
  // Persistence-only recovery: never repeat the provider. A failed write may have committed.
  await deps.write(token, id, data, claim.version).catch(() => false);
  let after = await deps.read(token, 'office_notes', id).catch(() => null);
  if (after?.data['detail'] === JSON.stringify(claimed) && after.version === claim.version) {
    await deps.write(token, id, data, claim.version).catch(() => false);
    after = await deps.read(token, 'office_notes', id).catch(() => null);
  }
  if (after?.data['detail'] !== data['detail'] || after.data['source'] !== SOURCE)
    return { ok: false, detail: 'Outcome persistence/readback unverified. No provider retry. Returned outcome is for recovery only.', recordId: id, recovery };
  return result(id, next);
}
