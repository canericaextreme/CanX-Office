import { describe, expect, it, vi } from 'vitest';
import { codexBuildsWith, type CodexBuildDeps } from './codex-builds.server';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const setup = (): CodexBuildDeps => ({ enabled: true, githubToken: 'private-github-key', verify: vi.fn().mockResolvedValue({ ok: true, userId: 'owner', aal: 'aal2', email: '' }), fetch: vi.fn() });
describe('Astra to Codex connection', () => {
  it('checks the connection without dispatching a build when no runs exist', async () => {
    const d = setup();
    vi.mocked(d.fetch).mockResolvedValueOnce(json({ workflow_runs: [] }));

    const result = await codexBuildsWith(d, 'owner');

    expect(result.ok).toBe(true);
    expect(result.previewUrl).toBeNull();
    expect(result.runs).toEqual([]);
    expect(d.fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(d.fetch).mock.calls[0]!;
    expect(url).toBe('https://api.github.com/repos/canericaextreme/CanX-Office/actions/workflows/canx-codex.yml/runs?per_page=30&event=workflow_dispatch');
    expect(init?.method ?? 'GET').toBe('GET');
    expect(init?.body).toBeUndefined();
  });
  it('reports a merged change without claiming deployment is verified', async () => {
    const d = setup();
    vi.mocked(d.fetch)
      .mockResolvedValueOnce(json({ number: 42, merged: true, head: {
        ref: 'codex/office-42', sha: 'merged-head', repo: { full_name: 'canericaextreme/CanX-Office' },
      } }))
      .mockResolvedValueOnce(json([]));

    const result = await codexBuildsWith(d, 'owner', undefined, 42);

    expect(result.ok).toBe(true);
    expect(result.detail).toContain('merged; deployment is unverified');
    expect(JSON.parse(result.evidence!)).toMatchObject({ number: 42, merged: true, head: 'merged-head' });
    expect(d.fetch).toHaveBeenCalledTimes(2);
    for (const [, init] of vi.mocked(d.fetch).mock.calls) {
      expect(init?.method ?? 'GET').toBe('GET');
      expect(init?.body).toBeUndefined();
    }
  });
  it('refuses unauthenticated callers before accessing GitHub', async () => {
    const d = setup(); vi.mocked(d.verify).mockResolvedValue({ ok: false, reason: 'mfa_required', message: 'MFA required' });
    expect(await codexBuildsWith(d, 'bad', 'Build an office widget')).toMatchObject({ ok: false, previewUrl: null });
    expect(d.fetch).not.toHaveBeenCalled();
  });
  it('does not pretend to connect when credentials or enablement are missing', async () => {
    for (const value of [{ githubToken: undefined }, { enabled: false }]) {
      const d = { ...setup(), ...value }; expect((await codexBuildsWith(d, 'owner')).ok).toBe(false); expect(d.fetch).not.toHaveBeenCalled();
    }
  });
  it('dispatches only to the fixed office workflow without owner credentials', async () => {
    const d = setup(); vi.mocked(d.fetch).mockResolvedValueOnce(json({ workflow_runs: [] })).mockResolvedValueOnce(json({ workflow_run_id: 42 }));
    const result = await codexBuildsWith(d, 'private-owner-session', 'Build a clearer office task list');
    expect(result.ok).toBe(true); expect(result.detail).toContain('Nothing has been published');
    expect(result.runs?.[0]).toMatchObject({ id: 42, state: 'queued', url: 'https://github.com/canericaextreme/CanX-Office/actions/runs/42' });
    const [url, init] = vi.mocked(d.fetch).mock.calls[1]!;
    expect(url).toBe('https://api.github.com/repos/canericaextreme/CanX-Office/actions/workflows/canx-codex.yml/dispatches');
    expect(JSON.parse(String(init?.body))).toEqual({ ref: 'main', inputs: { request: 'Build a clearer office task list' } });
    expect(String(init?.body)).not.toContain('private-owner-session');
  });
  it('does not add another paid job while a build is active', async () => {
    const d = setup(); vi.mocked(d.fetch).mockResolvedValueOnce(json({ workflow_runs: [{ id: 4, status: 'in_progress' }] }));
    expect((await codexBuildsWith(d, 'owner', 'Build another office widget')).ok).toBe(false); expect(d.fetch).toHaveBeenCalledOnce();
  });
  it('reports uncertainty without automatically repeating a failed dispatch', async () => {
    const d = setup(); vi.mocked(d.fetch).mockResolvedValueOnce(json({ workflow_runs: [] })).mockRejectedValueOnce(Error('private-secret'));
    const result = await codexBuildsWith(d, 'owner', 'Build another office widget');
    expect(result.detail).toContain('may already be running'); expect(result.detail).not.toContain('private-secret'); expect(d.fetch).toHaveBeenCalledTimes(2);
  });
  it('returns unsuccessful and skipped jobs as such, not as builds completed', async () => {
    const d = setup(); vi.mocked(d.fetch).mockResolvedValueOnce(json({ workflow_runs: [{ id: 4, status: 'completed', conclusion: 'skipped', html_url: 'https://evil.test' }] }));
    const result = await codexBuildsWith(d, 'owner'); expect(result.runs?.[0]?.state).toBe('skipped'); expect(result.runs?.[0]?.url).toContain('github.com/canericaextreme/CanX-Office');
  });
  it('only fetches evidence from this office workflow branch', async () => {
    const d = setup(); vi.mocked(d.fetch).mockResolvedValueOnce(json({ head: { ref: 'main', repo: { full_name: 'attacker/repo' } } }));
    expect((await codexBuildsWith(d, 'owner', undefined, 4)).ok).toBe(false); expect(d.fetch).toHaveBeenCalledOnce();
  });
  it('reads an exact linked run and its draft without dispatching or claiming publication', async () => {
    const d = setup();
    vi.mocked(d.fetch).mockResolvedValueOnce(json({ id: 42, path: '.github/workflows/canx-codex.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success' }))
      .mockResolvedValueOnce(json([{ number: 51, head: { ref: 'codex/office-42', repo: { full_name: 'canericaextreme/CanX-Office' } } }]));
    const result = await codexBuildsWith(d, 'owner', undefined, undefined, 42);
    expect(result.detail).toContain('Draft change #51');
    expect(result.detail).toContain('deployment remain unverified');
    expect(result.runs?.[0]?.state).toBe('success');
    expect(result.previewUrl).toBeNull();
    for (const [, init] of vi.mocked(d.fetch).mock.calls) expect(init?.method ?? 'GET').toBe('GET');
  });
  it('rejects a linked run from another workflow', async () => {
    const d = setup();
    vi.mocked(d.fetch).mockResolvedValueOnce(json({ id: 42, path: '.github/workflows/other.yml', event: 'workflow_dispatch' }));
    expect((await codexBuildsWith(d, 'owner', undefined, undefined, 42)).ok).toBe(false);
    expect(d.fetch).toHaveBeenCalledOnce();
  });
});
