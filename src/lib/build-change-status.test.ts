import { describe, expect, it, vi } from 'vitest';
import { buildChangeStatus } from './build-change-status';
import { claudeBuildsWith, type ClaudeBuildDeps } from './claude-builds.server';
import { codexBuildsWith, type CodexBuildDeps } from './codex-builds.server';

const REPO = 'canericaextreme/CanX-Office';
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
const verify = vi.fn().mockResolvedValue({ ok: true, userId: 'owner', aal: 'aal2', email: '' });

describe('a passing build reports what its change became', () => {
  it('a merged change is reported as merged, with publication still unchecked', () => {
    const line = buildChangeStatus({ number: 122, state: 'closed', merged_at: '2026-10-16T04:44:43Z' }, REPO);
    expect(line).toContain('Change #122 was merged into main on 2026-10-16');
    expect(line).toContain('whether that version is published was not checked');
    expect(line).not.toMatch(/Review and deployment remain unverified|Draft change/);
  });
  it('a closed, unmerged change says so; an open one is still a draft', () => {
    expect(buildChangeStatus({ number: 7, state: 'closed', merged_at: null }, REPO)).toContain('closed without merging');
    expect(buildChangeStatus({ number: 8, state: 'open', merged_at: null }, REPO)).toContain('Review and deployment remain unverified. Draft change #8');
    expect(buildChangeStatus(undefined, REPO)).toContain('Review and deployment remain unverified.');
  });

  it('live 17 Oct case: Claude build 38851382385 and its merged PR 122', async () => {
    const d: ClaudeBuildDeps = { enabled: true, githubToken: 'k', verify, fetch: vi.fn(), maxBudgetUsd: 2 };
    vi.mocked(d.fetch)
      .mockResolvedValueOnce(json({ id: 38851382385, path: '.github/workflows/canx-claude.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success' }))
      .mockResolvedValueOnce(json([{ number: 122, state: 'closed', merged_at: '2026-10-16T04:44:43Z', head: { ref: 'claude/office-38851382385', repo: { full_name: REPO } } }]));
    const result = await claudeBuildsWith(d, 'owner', undefined, undefined, 38851382385);
    expect(result.detail).toContain('Change #122 was merged into main on 2026-10-16');
    expect(result.detail).not.toContain('Review and deployment remain unverified');
  });

  it('the Codex builder reports the same way', async () => {
    const d: CodexBuildDeps = { enabled: true, githubToken: 'k', verify, fetch: vi.fn() };
    vi.mocked(d.fetch)
      .mockResolvedValueOnce(json({ id: 42, path: '.github/workflows/canx-codex.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success' }))
      .mockResolvedValueOnce(json([{ number: 51, state: 'closed', merged_at: '2026-10-15T01:00:00Z', head: { ref: 'codex/office-42', repo: { full_name: REPO } } }]));
    expect((await codexBuildsWith(d, 'owner', undefined, undefined, 42)).detail).toContain('Change #51 was merged');
  });
});
