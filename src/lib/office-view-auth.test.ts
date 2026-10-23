import { describe, expect, it } from 'vitest';
import { endViewerSession } from './office-view-auth';

describe('temporary viewer session cleanup', () => {
  it.each(['chatgpt', 'claude', 'elsie'])('preserves overlapping %s sessions', async assistant => {
    const current = `${assistant}-read`;
    const overlapping = `${assistant}-capture`;
    const sessions = new Set([current, overlapping]);
    await endViewerSession(current, async (path, token) => {
      const scope = new URL(path, 'https://example.test').searchParams.get('scope');
      if (scope === 'local') sessions.delete(token);
      else sessions.clear();
    });
    expect(sessions.has(current)).toBe(false);
    expect(sessions.has(overlapping)).toBe(true);
  });
  it('does not retry failed cleanup with broader scope', async () => {
    const paths: string[] = [];
    await endViewerSession('temporary', async path => { paths.push(path); throw Error('unavailable'); });
    expect(paths).toEqual(['/auth/v1/logout?scope=local']);
  });
});
