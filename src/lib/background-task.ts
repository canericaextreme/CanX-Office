/** Durable orchestration contract. No timer, browser storage, provider or authority here. */
export const SAFE_HIGHWAYS_ASSIGNMENT = '43da2350-e1aa-4d22-a1da-9885295888be';
export const BACKGROUND_ACTIVATION = 'Blocked: no approved server scheduler or unattended owner identity is connected';
export type BackgroundPhase = 'queued' | 'running' | 'waiting' | 'paused' | 'cancelled' | 'blocked' | 'unknown' | 'verified';
export interface BackgroundTask {
  schema: 'office-background/1'; id: string; ownerId: string; taskId: string;
  phase: BackgroundPhase; revision: number; stepId: string;
  attempts: number; nextAt: number; lease?: { holder: string; until: number } | undefined;
  outcome?: { receipt: string; verifiedAt: number } | undefined; reason?: string | undefined;
}
export interface BackgroundStore {
  read(): Promise<BackgroundTask>;
  /** Atomic exact-revision compare/save; false includes conflicts. Never unconditional upsert. */
  compareSave(before: BackgroundTask, after: BackgroundTask): Promise<boolean>;
}
export type StepResult = { kind: 'verified'; receipt: string } | { kind: 'pending' } | { kind: 'unknown' | 'blocked' };
export interface BackgroundDeps {
  store: BackgroundStore;
  /** Recheck current owner, task cancellation, autopilot, grants and existing guards. */
  permitted(task: BackgroundTask): Promise<boolean>;
  /** Must use the existing guarded executor; stable stepId must survive all recoveries. */
  execute(task: BackgroundTask): Promise<StepResult>;
  /** Read-only receipt reconciliation; never resubmit an interrupted step. */
  reconcile(task: BackgroundTask): Promise<StepResult>;
}
export const newBackgroundTask = (id: string, ownerId: string, taskId: string, now: number): BackgroundTask => ({
  schema: 'office-background/1', id, ownerId, taskId, phase: 'queued', revision: 0,
  stepId: `${id}:execute:1`, attempts: 0, nextAt: now,
});
const terminal = (s: BackgroundTask) => ['cancelled', 'paused', 'blocked', 'unknown', 'verified'].includes(s.phase);
const next = (s: BackgroundTask, patch: Partial<BackgroundTask>): BackgroundTask => ({ ...s, ...patch, revision: s.revision + 1 });
async function save(store: BackgroundStore, before: BackgroundTask, after: BackgroundTask) {
  if (!await store.compareSave(before, after)) return { state: 'conflict' as const };
  const checked = await store.read();
  return JSON.stringify(checked) === JSON.stringify(after)
    ? { state: 'saved' as const, task: checked } : { state: 'unconfirmed' as const };
}
/** One scheduled invocation, bounded to one execution or one read-only reconciliation. */
export async function backgroundTick(deps: BackgroundDeps, holder: string, now: number) {
  const s = await deps.store.read();
  if (terminal(s) || s.nextAt > now || (s.lease && s.lease.until > now)) return { state: 'idle' as const };
  if (!await deps.permitted(s)) return save(deps.store, s, next(s, { phase: 'blocked', lease: undefined, reason: 'Current authorization or task controls refused execution' }));
  if (s.attempts >= 3) return save(deps.store, s, next(s, { phase: 'unknown', lease: undefined, reason: 'Receipt check limit reached; inspect outcome without replay' }));
  const claimed = next(s, { phase: 'running', attempts: s.attempts + 1, lease: { holder, until: now + 60_000 } });
  const claim = await save(deps.store, s, claimed);
  if (claim.state !== 'saved') return claim;
  // A control that races this claim wins its own revision. Recheck before effects.
  const current = await deps.store.read();
  if (JSON.stringify(current) !== JSON.stringify(claimed)) return { state: 'conflict' as const };
  if (!await deps.permitted(current)) return save(deps.store, claimed, next(claimed, { phase: 'blocked', lease: undefined, reason: 'Authorization changed after claim' }));
  let result: StepResult;
  try { result = s.phase === 'queued' ? await deps.execute(claimed) : await deps.reconcile(claimed); }
  catch { result = { kind: 'unknown' }; }
  const patch: Partial<BackgroundTask> = { lease: undefined, phase: result.kind === 'pending' ? 'waiting' : result.kind, nextAt: now + 30_000 * 2 ** (claimed.attempts - 1) };
  if (result.kind === 'verified') {
    if (!result.receipt.trim()) patch.phase = 'unknown';
    else patch.outcome = { receipt: result.receipt, verifiedAt: now };
  }
  return save(deps.store, claimed, next(claimed, patch));
}
/** Controls stop future steps; they do not claim to undo external work already submitted. */
export async function backgroundControl(deps: BackgroundDeps, action: 'pause' | 'resume' | 'cancel') {
  const s = await deps.store.read();
  if (!await deps.permitted(s)) return { state: 'denied' as const };
  if (['cancelled', 'verified'].includes(s.phase)) return { state: 'idle' as const };
  if (action === 'resume' && s.phase !== 'paused') return { state: 'idle' as const };
  return save(deps.store, s, next(s, { phase: action === 'cancel' ? 'cancelled' : action === 'pause' ? 'paused' : s.attempts ? 'waiting' : 'queued', lease: undefined }));
}
