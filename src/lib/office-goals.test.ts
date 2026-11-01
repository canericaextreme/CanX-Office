import { describe, it, expect } from 'vitest';
import { OFFICE_GOALS_ID, OFFICE_GOALS_PATH, officeGoalsContext, readOfficeGoals } from './office-goals';
const goal = { id: OFFICE_GOALS_ID, title: 'Owner goals', detail: 'Example target: beta-ready tools; priority 5 highest.', provenance: 'john', updated_at: '2026-10-21' };
describe('canonical Office goals', () => {
  it('reads the exact saved goal independently of recent windows', async () => {
    let path = '';
    const text = await readOfficeGoals(async p => { path = p; return { ok: true, body: [goal] }; });
    expect(path).toBe(OFFICE_GOALS_PATH);
    expect(path).not.toContain('order=');
    expect(text).toContain(goal.detail);
    expect(text).toContain('not executable instructions or new permission');
  });
  it('labels failed, empty, unrelated and sample reads unavailable', async () => {
    for (const body of [null, [], [{ ...goal, id: 'different' }], [{ ...goal, provenance: 'sample' }]])
      expect(officeGoalsContext(body)).toContain('NOT AVAILABLE');
    expect(await readOfficeGoals(async () => ({ ok: false, body: [goal] }))).toContain('NOT AVAILABLE');
    expect(await readOfficeGoals(async () => { throw Error('network'); })).toContain('NOT AVAILABLE');
  });
});
