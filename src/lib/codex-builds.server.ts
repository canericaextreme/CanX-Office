/** Server-only GitHub build bridge. No credentials or owner tokens enter job inputs. */
import type { OwnerVerification } from './canx-backend.server';
export const CODEX_REPO = 'canericaextreme/CanX-Office';
export const CODEX_WORKFLOW = 'canx-codex.yml';
const ROOT = `https://api.github.com/repos/${CODEX_REPO}`;
export interface CodexBuildDeps {
  verify: (token: string) => Promise<OwnerVerification>;
  githubToken: string | undefined;
  enabled: boolean;
  fetch: typeof fetch;
}
export interface CodexBuildResult { ok: boolean; detail: string; runs?: { id: number; title: string; state: string; url: string }[]; evidence?: string; }
const missing = 'Codex builds are not connected yet. Configure the private GitHub connection and enable the build workflow after its OpenAI key and spending limit are set.';
const plain = (x: unknown, max = 1000) => typeof x === 'string' ? x.slice(0, max) : '';
async function api(deps: CodexBuildDeps, path: string, init: RequestInit = {}) {
  return deps.fetch(ROOT + path, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000), headers: {
    Accept: 'application/vnd.github+json', Authorization: `Bearer ${deps.githubToken}`,
    'X-GitHub-Api-Version': '2026-03-10', 'Content-Type': 'application/json',
  } });
}
const denied = (detail: string): CodexBuildResult => ({ ok: false, detail });
export async function codexBuildsWith(deps: CodexBuildDeps, token: string, request?: string, prNumber?: number): Promise<CodexBuildResult> {
  const owner = await deps.verify(token);
  if (!owner.ok) return denied(owner.message);
  if (!deps.githubToken || !deps.enabled) return denied(missing);
  if (request !== undefined && (request.trim().length < 10 || request.length > 6000)) return denied('Describe the build in 10–6,000 characters.');
  if (prNumber !== undefined && (!Number.isSafeInteger(prNumber) || prNumber < 1)) return denied('Choose a valid Codex change number.');
  try {
    if (prNumber !== undefined) {
      const response = await api(deps, `/pulls/${prNumber}`);
      if (!response.ok) return denied('Could not read that Codex change.');
      const pr = await response.json();
      if (pr.head?.repo?.full_name !== CODEX_REPO || !/^codex\/office-\d+$/.test(pr.head?.ref ?? '')) return denied('That change did not come from the office Codex build workflow.');
      const filesResponse = await api(deps, `/pulls/${prNumber}/files?per_page=30`);
      if (!filesResponse.ok) return denied('Could not retrieve the changes for review.');
      const files = await filesResponse.json();
      if (!Array.isArray(files)) return denied('The change list was not readable.');
      const evidence = JSON.stringify({ number: pr.number, head: pr.head.sha, title: plain(pr.title),
        body: plain(pr.body, 4000), merged: pr.merged === true,
        scope: 'First 30 files, patch excerpts only; not a complete security audit.',
        files: files.map((f: Record<string, unknown>) => ({ path: plain(f["filename"]), status: plain(f["status"]), patch: plain(f["patch"], 2000) })) });
      return { ok: true, detail: `Retrieved Codex change #${prNumber}. It is ${pr.merged ? 'merged; deployment is unverified' : 'not merged or published'}.`, evidence: evidence.slice(0, 16000) };
    }
    const response = await api(deps, `/actions/workflows/${CODEX_WORKFLOW}/runs?per_page=30&event=workflow_dispatch`);
    if (!response.ok) return denied('The Codex build workflow could not be read. Check the GitHub connection and workflow installation.');
    const body = await response.json();
    if (!Array.isArray(body.workflow_runs)) return denied('The Codex run list was not readable.');
    const runs = body.workflow_runs.map((r: Record<string, unknown>) => ({ id: Number(r["id"]), title: plain(r["display_title"]),
      state: r["status"] === 'completed' ? plain(r["conclusion"]) : plain(r["status"]), url: `https://github.com/${CODEX_REPO}/actions/runs/${Number(r["id"])}` }));
    if (request === undefined) return { ok: true, detail: 'Live Codex run status. A successful run prepares a draft change; it does not publish it.', runs };
    // Serialize paid jobs. Do not retry a timed-out dispatch: it may have reached GitHub.
    if (runs.some((r: {state: string}) => ['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(r.state))) return denied('A Codex build is already queued or running. Check its result before starting another.');
    const sent = await api(deps, `/actions/workflows/${CODEX_WORKFLOW}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { request: request.trim() } }) });
    if (!sent.ok) return denied('GitHub did not accept the Codex build. Check Actions access and the workflow configuration.');
    return { ok: true, detail: 'GitHub accepted the Codex build request. Check Build & Testing for its run and draft changes. Nothing has been published.' };
  } catch { return denied(request === undefined ? 'Codex status is unavailable right now.' : 'The build submission could not be confirmed. Check Build & Testing before trying again; the request may already be running.'); }
}
