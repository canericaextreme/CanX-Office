import { z } from "zod";
import { type BackgroundTask, type BackgroundStore, type StepResult } from './background-task';
import type { WorkbenchDeps } from './manager-work.functions';
import { executeTaskWith, type TaskExecutionDeps } from './task-execution.server';

const checkpointSchema = z.object({
  schema: z.literal('office-background/1'), id: z.string().min(1).max(100), ownerId: z.string().min(1), taskId: z.string().uuid(),
  phase: z.enum(['queued', 'running', 'waiting', 'paused', 'cancelled', 'blocked', 'unknown', 'verified']),
  revision: z.number().int().nonnegative(), stepId: z.string().min(1).max(200),
  attempts: z.number().int().min(0).max(3), nextAt: z.number().finite().nonnegative(),
  lease: z.object({ holder: z.string().min(1), until: z.number().finite().nonnegative() }).optional(),
  outcome: z.object({ receipt: z.string().trim().min(1).max(2000), verifiedAt: z.number().finite().nonnegative() }).optional(),
  reason: z.string().max(2000).optional(),
}).strict();

/** Existing owner-only office_notes storage. Provisioning/enrolment is intentionally absent. */
export function backgroundNoteStore(work: WorkbenchDeps, token: string, noteId: string): BackgroundStore {
  const path = `office_notes?id=eq.${encodeURIComponent(noteId)}`;
  const read = async () => {
    const owner = await work.verifyOwner(token);
    if (!owner.ok) throw Error('Owner verification required');
    const r = await work.rest<Array<{ owner_id: string; detail: string; source: string }>>(token, 'GET', `${path}&owner_id=eq.${encodeURIComponent(owner.userId)}&select=owner_id,detail,source`);
    const row = r.ok ? r.data?.[0] : undefined;
    if (!row || row.owner_id !== owner.userId || row.source !== 'CanX background checkpoint') throw Error('Owned checkpoint unavailable');
    const s = JSON.parse(row.detail) as BackgroundTask;
    checkpointSchema.parse(s);
    if (s.schema !== 'office-background/1' || s.ownerId !== owner.userId || s.id !== noteId || !Number.isSafeInteger(s.revision)) throw Error('Invalid checkpoint');
    return s;
  };
  return { read, compareSave: async (before, after) => {
    const current = await read();
    if (JSON.stringify(current) !== JSON.stringify(before) || after.revision !== before.revision + 1 || after.ownerId !== before.ownerId || after.taskId !== before.taskId || after.stepId !== before.stepId || after.id !== before.id) return false;
    const r = await work.rest<unknown[]>(token, 'PATCH', `${path}&owner_id=eq.${encodeURIComponent(before.ownerId)}&detail=eq.${encodeURIComponent(JSON.stringify(before))}`, { detail: JSON.stringify(after) });
    return r.ok && Array.isArray(r.data) && r.data.length === 1;
  } };
}
/** Existing executor and exact-run polling. A passing builder is never a verified task outcome. */
export async function backgroundExecutionStep(deps: TaskExecutionDeps, token: string, task: BackgroundTask, reconcile: boolean): Promise<StepResult> {
  const result = await executeTaskWith(deps, token, task.taskId, reconcile);
  if (!result.ok) return { kind: 'unknown' };
  const run = result.runs?.[0];
  if (!run) return { kind: 'unknown' };
  if (['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(run.state)) return { kind: 'pending' };
  // Release/outcome verification remains the existing owner-reviewed completion path.
  return { kind: 'blocked' };
}
