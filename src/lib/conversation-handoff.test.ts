import { describe, expect, it } from 'vitest';
import { datedHandoffId, handoffContext, handoffNotes, latestHandoffId, readLatestHandoffs } from './conversation-handoff';

describe('conversation handoffs', () => {
  it('uses fixed ids so any assistant can read them without paging the Brain', () => {
    expect(latestHandoffId('claude')).toBe('handoff-latest-claude');
    expect(latestHandoffId('chatgpt')).toBe('handoff-latest-chatgpt');
    expect(datedHandoffId('claude', new Date('2026-10-19T08:15:42Z'))).toBe('handoff-claude-20261019-0815');
  });
  it('keeps only latest-handoff notes, newest first, trimmed', () => {
    const notes = handoffNotes([
      { id: 'handoff-latest-claude', title: 'A', detail: 'x'.repeat(2000), updated_at: '2026-10-18T00:00:00Z' },
      { id: 'handoff-latest-chatgpt', title: 'B', detail: 'y', updated_at: '2026-10-19T00:00:00Z' },
      { id: 'handoff-claude-20261018-0000', title: 'old copy', detail: 'z', updated_at: '2026-10-19T01:00:00Z' },
      { id: 'handoff-latest-claude', title: 'dup', detail: '', updated_at: '2026-10-20T00:00:00Z' },
      null,
    ]);
    expect(notes.map(n => n.agent)).toEqual(['chatgpt', 'claude']);
    expect(notes[1]!.detail.length).toBe(700);
  });
  it('says nothing when nobody has left a handoff', () => {
    expect(handoffContext([])).toBe('');
  });
  it('reads as the owner and never throws', async () => {
    const paths: string[] = [];
    const notes = await readLatestHandoffs(async p => { paths.push(p); return { ok: true, status: 200, body: [{ id: 'handoff-latest-claude', title: 'T', detail: 'D', updated_at: 'u' }] }; }, 'owner-1');
    expect(paths[0]).toContain('owner_id=eq.owner-1');
    expect(notes).toHaveLength(1);
    expect(await readLatestHandoffs(async () => { throw new Error('down'); }, 'owner-1')).toEqual([]);
  });
});
