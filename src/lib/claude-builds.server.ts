/** Server-only GitHub build bridge. No credentials or owner tokens enter job inputs. */
import type { OwnerVerification } from './canx-backend.server';
import { newBuildGitHubTrace, traceBuildGitHubRequest, readBuildGitHubJson, buildGitHubFailure, buildGitHubHttpFailure, type BuildGitHubTrace } from './build-github-diagnostic';
export const CLAUDE_REPO = 'canericaextreme/CanX-Office';
export const CLAUDE_WORKFLOW = 'canx-claude.yml';
/** John authorised US$10 per Claude build on 4 October 2026. */
export const CLAUDE_BUILD_MAX_USD = 10;
const ROOT = `https://api.github.com/repos/${CLAUDE_REPO}`;
export interface ClaudeBuildDeps {
  verify: (token: string) => Promise<OwnerVerification>;
  githubToken: string | undefined;
  enabled: boolean;
  fetch: typeof fetch;
  maxBudgetUsd: number | undefined;
}
export interface ClaudeBuildResult { ok: boolean; detail: string; runs?: { id: number; title: string; state: string; url: string }[]; evidence?: string; }
const missing = 'Claude builds are not connected yet. Configure the private GitHub connection and enable the build workflow after its Claude API credential and spending limit are set.';
const plain = (x: unknown, max = 1000) => typeof x === 'string' ? x.slice(0, max) : '';
async function api(deps: ClaudeBuildDeps, path: string, trace: BuildGitHubTrace, init: RequestInit = {}) {
  traceBuildGitHubRequest(trace, path, init);
  // Inspect redirects explicitly. Never forward the GitHub credential to a redirected destination.
  return deps.fetch(ROOT + path, { ...init, redirect: 'manual', signal: AbortSignal.timeout(15000), headers: {
    'User-Agent': 'CanX-Office-build-bridge',
    Accept: 'application/vnd.github+json', Authorization: `Bearer ${deps.githubToken}`,
    'X-GitHub-Api-Version': '2026-03-10', 'Content-Type': 'application/json',
  } });
}
const denied = (detail: string): ClaudeBuildResult => ({ ok: false, detail });
export async function claudeBuildsWith(deps: ClaudeBuildDeps, token: string, request?: string, prNumber?: number, runId?: number): Promise<ClaudeBuildResult> {
  const owner = await deps.verify(token);
  if (!owner.ok) return denied(owner.message);
  if (!deps.githubToken || !deps.enabled) {
    const reasons = [
      ...(!deps.githubToken ? ['The Office server cannot read the shared private GitHub build connection.'] : []),
      ...(!deps.enabled ? ['CANX_CLAUDE_ENABLED is missing or is not exactly lowercase true on the Office server.'] : []),
    ];
    return denied(missing + ' Configuration check: ' + reasons.join(' '));
  }
  if (request !== undefined && (!deps.maxBudgetUsd || !Number.isFinite(deps.maxBudgetUsd) || deps.maxBudgetUsd < 0.1 || deps.maxBudgetUsd > 10)) return denied('Set an owner-approved Claude API maximum per build (USD 0.10–10.00) on the server before submitting.');
  if (request !== undefined && (request.trim().length < 10 || request.length > 6000)) return denied('Describe the build in 10–6,000 characters.');
  if (prNumber !== undefined && (!Number.isSafeInteger(prNumber) || prNumber < 1)) return denied('Choose a valid Claude change number.');
  if (runId !== undefined && (!Number.isSafeInteger(runId) || runId < 1 || request !== undefined || prNumber !== undefined)) return denied('Choose one valid run to check.');
  const trace = newBuildGitHubTrace();
  try {
    if (runId !== undefined) {
      const response = await api(deps, `/actions/runs/${runId}`, trace);
      if (!response.ok) return denied('Could not read the task’s linked build. Nothing was retried.' + buildGitHubHttpFailure(response, trace));
      const run = await readBuildGitHubJson(response, trace);
      if (run.id !== runId || run.path !== `.github/workflows/${CLAUDE_WORKFLOW}` || run.event !== 'workflow_dispatch') return denied('That run is not an Office Claude build.');
      const state = run.status === 'completed' ? plain(run.conclusion) : plain(run.status);
      const url = `https://github.com/${CLAUDE_REPO}/actions/runs/${runId}`;
      let detail = `Task build ${runId}: ${state}.`;
      if (state === 'success') {
        detail += ' Candidate typecheck, tests and build passed. Review and deployment remain unverified.';
        const prs = await api(deps, `/pulls?state=all&head=canericaextreme:claude/office-${runId}&per_page=10`, trace);
        if (prs.ok) {
          const body = await readBuildGitHubJson(prs, trace);
          const pr = Array.isArray(body) ? body.find(p => p.head?.ref === `claude/office-${runId}` && p.head?.repo?.full_name === CLAUDE_REPO) : undefined;
          if (pr && Number.isSafeInteger(pr.number)) detail += ` Draft change #${pr.number}: https://github.com/${CLAUDE_REPO}/pull/${pr.number}.`;
        }
      }
      return { ok: true, detail, runs: [{ id: runId, title: plain(run.display_title), state, url }] };
    }
    if (prNumber !== undefined) {
      const response = await api(deps, `/pulls/${prNumber}`, trace);
      if (!response.ok) return denied('Could not read that Claude change.' + buildGitHubHttpFailure(response, trace));
      const pr = await readBuildGitHubJson(response, trace);
      if (pr.head?.repo?.full_name !== CLAUDE_REPO || !/^claude\/office-\d+$/.test(pr.head?.ref ?? '')) return denied('That change did not come from the office Claude build workflow.');
      const filesResponse = await api(deps, `/pulls/${prNumber}/files?per_page=30`, trace);
      if (!filesResponse.ok) return denied('Could not retrieve the changes for review.' + buildGitHubHttpFailure(filesResponse, trace));
      const files = await readBuildGitHubJson(filesResponse, trace);
      if (!Array.isArray(files)) return denied('The change list was not readable.');
      const evidence = JSON.stringify({ number: pr.number, head: pr.head.sha, title: plain(pr.title),
        body: plain(pr.body, 4000), merged: pr.merged === true,
        scope: 'First 30 files, patch excerpts only; not a complete security audit.',
        files: files.map((f: Record<string, unknown>) => ({ path: plain(f["filename"]), status: plain(f["status"]), patch: plain(f["patch"], 2000) })) });
      return { ok: true, detail: `Retrieved Claude change #${prNumber}. It is ${pr.merged ? 'merged; deployment is unverified' : 'not merged or published'}.`, evidence: evidence.slice(0, 16000) };
    }
    const response = await api(deps, `/actions/workflows/${CLAUDE_WORKFLOW}/runs?per_page=30&event=workflow_dispatch`, trace);
    if (!response.ok) return denied('The Claude build workflow could not be read. Check the GitHub connection and workflow installation.' + buildGitHubHttpFailure(response, trace));
    const body = await readBuildGitHubJson(response, trace);
    if (!Array.isArray(body.workflow_runs)) return denied('The Claude run list was not readable.');
    const runs = body.workflow_runs.map((r: Record<string, unknown>) => ({ id: Number(r["id"]), title: plain(r["display_title"]),
      state: r["status"] === 'completed' ? plain(r["conclusion"]) : plain(r["status"]), url: `https://github.com/${CLAUDE_REPO}/actions/runs/${Number(r["id"])}` }));
    if (request === undefined) return { ok: true, detail: 'Live Claude run status. A successful run prepares a draft change; it does not publish it.', runs };
    // Serialize paid jobs. Do not retry a timed-out dispatch: it may have reached GitHub.
    if (runs.some((r: {state: string}) => ['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(r.state))) return denied('A Claude build is already queued or running. Check its result before starting another.');
    const sent = await api(deps, `/actions/workflows/${CLAUDE_WORKFLOW}/dispatches`, trace, { method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { request: request.trim(), max_budget_usd: String(deps.maxBudgetUsd) } }) });
    if (!sent.ok) return denied('GitHub did not accept the Claude build. Check Actions access and the workflow configuration.' + buildGitHubHttpFailure(sent, trace));
    // The current GitHub API returns the exact dispatched run. Never attach
    // an unrelated "latest" run to a task, and never redispatch on parse failure.
    const accepted = 'GitHub accepted the Claude build request. Nothing has been published.';
    try {
      const body = await readBuildGitHubJson(sent, trace);
      if (Number.isSafeInteger(body.workflow_run_id) && body.workflow_run_id > 0) {
        const id = body.workflow_run_id;
        return { ok: true, detail: accepted, runs: [{ id, title: 'Task build', state: 'queued', url: `https://github.com/${CLAUDE_REPO}/actions/runs/${id}` }] };
      }
    } catch { /* Older API responses may be empty. Submission still accepted. */ }
    return { ok: true, detail: accepted + ' No run identifier was returned; check Build & Testing manually before any further submission.' };
  } catch (error) {
    const reason = buildGitHubFailure(error, trace);
    return denied(request === undefined
      ? 'Claude status is unavailable. Connection diagnostic: ' + reason
      : 'The build submission could not be confirmed. Check Build & Testing before trying again; the request may already be running. ' + reason);
  }
}

