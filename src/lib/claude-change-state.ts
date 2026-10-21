/** Read-only state of one pull request a full Claude worker opened for a
 * handed-over task. Uses the Office's existing GitHub read connection; it never
 * writes, merges or starts anything. Only same-repository `claude/` branches count.
 */
import type { ChangeState } from './claude-takeover';

export const CHANGE_REPO = 'canericaextreme/CanX-Office';

export async function readClaudeChangeWith(deps: { githubToken: string | undefined; fetch: typeof fetch }, prNumber: number): Promise<ChangeState | null> {
  if (!deps.githubToken || !Number.isSafeInteger(prNumber) || prNumber < 1) return null;
  const response = await deps.fetch(`https://api.github.com/repos/${CHANGE_REPO}/pulls/${prNumber}`, {
    redirect: 'manual', signal: AbortSignal.timeout(15000), headers: {
      'User-Agent': 'CanX-Office-build-bridge', Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${deps.githubToken}`, 'X-GitHub-Api-Version': '2026-03-10',
    },
  });
  if (!response.ok) return null;
  const pr = await response.json() as { number?: unknown; merged_at?: unknown; state?: unknown; draft?: unknown; head?: { ref?: unknown; repo?: { full_name?: unknown } } };
  if (pr.number !== prNumber || String(pr.head?.repo?.full_name).toLowerCase() !== CHANGE_REPO.toLowerCase() || typeof pr.head?.ref !== 'string' || !pr.head.ref.startsWith('claude/')) return null;
  const url = `https://github.com/${CHANGE_REPO}/pull/${prNumber}`;
  if (typeof pr.merged_at === 'string' && pr.merged_at) return { state: 'merged', url };
  if (pr.state === 'closed') return { state: 'closed', url };
  return { state: pr.draft === true ? 'draft' : 'open', url };
}
