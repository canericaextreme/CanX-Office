import { describe, expect, it, vi } from 'vitest';
import { backgroundControl, backgroundTick, newBackgroundTask, type BackgroundTask, type BackgroundDeps, type StepResult } from './background-task';
function fixture() {
  let state = newBackgroundTask('job', 'owner', 'task', 0);
  const deps: BackgroundDeps = {
    store: { read: async () => structuredClone(state), compareSave: async (a, b) => {
      if (a.revision !== state.revision) return false;
      state = structuredClone(b); return true;
    } },
    permitted: vi.fn(async () => true), execute: vi.fn(async (): Promise<StepResult> => ({ kind: 'pending' })),
    reconcile: vi.fn(async (): Promise<StepResult> => ({ kind: 'verified', receipt: 'independent-outcome-readback' })),
  };
  return { deps, state: () => state, set: (s: BackgroundTask) => { state = s; } };
}
describe('durable background ticks', () => {
  it('claims concurrent invocations exactly once', async () => {
    const f = fixture();
    await Promise.all([backgroundTick(f.deps, 'a', 0), backgroundTick(f.deps, 'b', 0)]);
    expect(f.deps.execute).toHaveBeenCalledTimes(1);
  });
  it('recovers an interrupted claim through receipt lookup without replay', async () => {
    const f = fixture(); f.set({ ...f.state(), phase: 'running', attempts: 1, lease: { holder: 'dead', until: 100 } });
    await backgroundTick(f.deps, 'new', 101);
    expect(f.deps.execute).not.toHaveBeenCalled(); expect(f.deps.reconcile).toHaveBeenCalledOnce();
    expect(f.state().phase).toBe('verified'); expect(f.state().outcome?.receipt).toBeTruthy();
  });
  it('cancelled work never starts or resumes', async () => {
    const f = fixture(); await backgroundControl(f.deps, 'cancel');
    await backgroundControl(f.deps, 'resume'); await backgroundTick(f.deps, 'a', 0);
    expect(f.state().phase).toBe('cancelled'); expect(f.deps.execute).not.toHaveBeenCalled();
  });
  it('denies controls and blocks execution on authorization failure', async () => {
    const f = fixture(); f.deps.permitted = async () => false;
    expect((await backgroundControl(f.deps, 'pause')).state).toBe('denied');
    await backgroundTick(f.deps, 'a', 0); expect(f.state().phase).toBe('blocked'); expect(f.deps.execute).not.toHaveBeenCalled();
  });
  it('never retries an unknown provider outcome', async () => {
    const f = fixture(); f.deps.execute = vi.fn(async () => { throw Error('timeout'); });
    await backgroundTick(f.deps, 'a', 0); await backgroundTick(f.deps, 'b', 100000);
    expect(f.state().phase).toBe('unknown'); expect(f.deps.execute).toHaveBeenCalledOnce();
  });
  it('bounds read-only retries and keeps step identity', async () => {
    const f = fixture(); f.deps.reconcile = vi.fn(async (): Promise<StepResult> => ({ kind: 'pending' }));
    for (const now of [0, 30000, 90000, 210000]) await backgroundTick(f.deps, 'a', now);
    expect(f.state().phase).toBe('unknown'); expect(f.state().attempts).toBe(3);
    expect(f.state().stepId).toBe('job:execute:1'); expect(f.deps.execute).toHaveBeenCalledOnce();
  });
  it('preserves cancellation racing a running step', async () => {
    const f = fixture(); f.deps.execute = async () => { await backgroundControl(f.deps, 'cancel'); return { kind: 'pending' }; };
    expect((await backgroundTick(f.deps, 'a', 0)).state).toBe('conflict'); expect(f.state().phase).toBe('cancelled');
  });
  it('pause/resume after submission only reconciles', async () => {
    const f = fixture(); await backgroundTick(f.deps, 'a', 0);
    await backgroundControl(f.deps, 'pause'); await backgroundTick(f.deps, 'a', 30000);
    await backgroundControl(f.deps, 'resume'); await backgroundTick(f.deps, 'a', 30000);
    expect(f.deps.execute).toHaveBeenCalledOnce(); expect(f.state().phase).toBe('verified');
  });
  it('does not execute when durable claim readback fails', async () => {
    const f = fixture(); f.deps.store.compareSave = async () => true;
    expect((await backgroundTick(f.deps, 'a', 0)).state).toBe('unconfirmed'); expect(f.deps.execute).not.toHaveBeenCalled();
  });
});
