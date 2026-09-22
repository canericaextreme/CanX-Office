/** Trusted publisher. Loaded from the dispatch SHA, not from the generated patch. */
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
const root = 'https://api.github.com/repos/canericaextreme/CanX-Office';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const runId = process.env.GITHUB_RUN_ID;
if (!/^\d+$/.test(runId || '') || process.env.GITHUB_REPOSITORY !== 'canericaextreme/CanX-Office') throw Error('Wrong build destination');
const base = readFileSync('/tmp/canx-candidate/base.txt', 'utf8').trim();
if (base !== process.env.GITHUB_SHA || git('rev-parse', 'HEAD') !== base) throw Error('Candidate base mismatch');
const patch = '/tmp/canx-candidate/change.patch';
if (lstatSync(patch).size > 2_000_000) throw Error('Candidate too large for automatic proposal');
if (!readFileSync(patch, 'utf8').trim()) throw Error('Codex produced no code change; no draft was created');
git('apply', '--check', patch);
git('apply', '--index', patch);
const paths = execFileSync('git', ['diff', '--cached', '--name-only', '-z']).toString().split('\0').filter(Boolean);
if (paths.length > 50 || paths.some(p => !/^(src|public|docs|tests)\//.test(p) || /(^|\/)\.\.?\//.test(p))) throw Error('Candidate changes exceed allowed scope');
// Record deletions explicitly. Reject executable files and symlinks.
const entries = paths.map(path => {
  const index = git('ls-files', '--stage', '--', path);
  if (!index) return { path, mode: '100644', type: 'blob', sha: null };
  if (!index.startsWith('100644 ') || !lstatSync(path).isFile() || lstatSync(path).size > 250_000) throw Error('Unsupported candidate file');
  const content = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path));
  if (content.includes('\0')) throw Error('Binary candidate requires manual review');
  return { path, mode: '100644', type: 'blob', content };
});
async function api(path, data) {
  const response = await fetch(root + path, { method: data ? 'POST' : 'GET', redirect: 'error',
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'Content-Type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {}) });
  if (!response.ok) throw Error(`GitHub publisher failed (${response.status})`);
  return response.json();
}
const parent = await api(`/git/commits/${base}`);
const tree = await api('/git/trees', { base_tree: parent.tree.sha, tree: entries });
const commit = await api('/git/commits', { message: `CanX Codex build ${runId}`, tree: tree.sha, parents: [base] });
const branch = `codex/office-${runId}`;
await api('/git/refs', { ref: `refs/heads/${branch}`, sha: commit.sha });
const result = readFileSync('/tmp/canx-candidate/result.md', 'utf8').slice(0, 12000);
const pr = await api('/pulls', { title: `CanX Codex build ${runId}`, head: branch, base: 'main', draft: true,
  body: `Codex prepared this change in response to an office build request.\n\nAutomated typecheck, tests and build passed on the candidate. Device testing, independent review and publication are not verified.\n\nBuild evidence: https://github.com/canericaextreme/CanX-Office/actions/runs/${runId}\n\nCodex report (agent-generated, requires review):\n\n${result}` });
console.log(`Draft change created: ${pr.html_url}`);
