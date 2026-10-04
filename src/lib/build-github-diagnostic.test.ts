import { describe, expect, it, vi } from 'vitest';
import { buildGitHubFailure, newBuildGitHubTrace } from './build-github-diagnostic';
import { claudeBuildsWith } from './claude-builds.server';
import { codexBuildsWith } from './codex-builds.server';

const secret = 'ghp_PRIVATE_VALUE owner-private-session';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const providers = [{ name: 'Claude', run: claudeBuildsWith }, { name: 'Codex', run: codexBuildsWith }];
describe.each(providers)('$name GitHub diagnostics', ({ run }) => {
  const setup = () => ({ enabled: true, githubToken: secret, maxBudgetUsd: 1,
    verify: vi.fn().mockResolvedValue({ ok: true, userId: 'owner', aal: 'aal2', email: '' }), fetch: vi.fn<typeof fetch>() });
  it('identifies a network failure in a read-only status request without exposing exception text', async () => {
    const deps = setup();
    deps.fetch.mockRejectedValue(new TypeError(secret, { cause: Object.assign(new Error(secret), { code: 'ENOTFOUND' }) }));
    const result = await run(deps, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('GH_NETWORK; workflow list; request; GET; cause ENOTFOUND');
    expect(result.detail).not.toContain(secret);
    expect(deps.fetch).toHaveBeenCalledOnce();
    expect(deps.fetch.mock.calls[0]![1]?.method ?? 'GET').toBe('GET');
  });
  it('reports denied HTTP status without reading or exposing the response body', async () => {
    const deps = setup();
    const response = new Response(secret, { status: 401 });
    deps.fetch.mockResolvedValue(response);
    const result = await run(deps, secret);
    expect(result.detail).toContain('GH_HTTP_401; workflow list; GET');
    expect(result.detail).not.toContain(secret);
    expect(response.bodyUsed).toBe(false);
    expect(deps.fetch).toHaveBeenCalledOnce();
  });
  it('distinguishes malformed JSON from an unexpected run payload', async () => {
    const deps = setup();
    deps.fetch.mockResolvedValueOnce(new Response(secret)).mockResolvedValueOnce(json({ workflow_runs: [null] }));
    expect((await run(deps, secret)).detail).toContain('GH_JSON_INVALID; workflow list; response JSON; GET');
    expect((await run(deps, secret)).detail).toContain('GH_RESPONSE_FAILED; workflow list; response processing; GET');
    for (const [, init] of deps.fetch.mock.calls) {
      expect(init?.method ?? 'GET').toBe('GET');
      expect(init?.body).toBeUndefined();
    }
  });
  it('reports the dispatch stage while preserving uncertainty and never retrying', async () => {
    const deps = setup();
    deps.fetch.mockResolvedValueOnce(json({ workflow_runs: [] })).mockRejectedValueOnce(new TypeError(secret));
    const result = await run(deps, secret, 'Build a harmless documentation note');
    expect(result.detail).toContain('may already be running');
    expect(result.detail).toContain('GH_REQUEST_FAILED; build dispatch; request; POST');
    expect(result.detail).not.toContain(secret);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
    for (const [, init] of deps.fetch.mock.calls) expect(init?.redirect).toBe('manual');
  });
  it('uses manual mode for runtimes rejecting redirect-error mode, without following redirects', async () => {
    const deps = setup();
    deps.fetch.mockImplementation(async (_url, init) => {
      if (init?.redirect === 'error') throw new TypeError('Unsupported redirect mode');
      expect(init?.redirect).toBe('manual');
      return json({ workflow_runs: [] });
    });
    expect(await run(deps, secret)).toMatchObject({ ok: true, runs: [] });
    expect(deps.fetch).toHaveBeenCalledOnce();
  });
  it('does not follow redirects or reveal their location or body', async () => {
    const deps = setup();
    deps.fetch.mockResolvedValue(new Response(secret, { status: 302, headers: { Location: 'https://untrusted.example/' + secret } }));
    const result = await run(deps, secret);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('GH_HTTP_302');
    expect(result.detail).toContain('did not follow');
    expect(result.detail).not.toContain(secret);
    expect(result.detail).not.toContain('untrusted.example');
    expect(deps.fetch).toHaveBeenCalledOnce();
    expect(deps.fetch.mock.calls[0]![1]?.redirect).toBe('manual');
  });
  it('preserves successful read-only status behaviour', async () => {
    const deps = setup();
    deps.fetch.mockResolvedValue(json({ workflow_runs: [] }));
    expect(await run(deps, secret)).toMatchObject({ ok: true, runs: [] });
    expect(deps.fetch).toHaveBeenCalledOnce();
    expect(deps.fetch.mock.calls[0]![1]?.body).toBeUndefined();
  });
});
describe('safe diagnostic classification', () => {
  it('does not expose unrecognised cause codes, URLs or messages', () => {
    const error = Object.assign(new TypeError(secret), { cause: { code: secret, message: 'https://private.example/' + secret } });
    expect(buildGitHubFailure(error, newBuildGitHubTrace())).toContain('GH_REQUEST_FAILED');
    expect(buildGitHubFailure(error, newBuildGitHubTrace())).not.toContain(secret);
    expect(buildGitHubFailure(error, newBuildGitHubTrace())).not.toContain('private.example');
  });
  it('identifies rejected headers and redirects without echoing sensitive text', () => {
    expect(buildGitHubFailure(new TypeError('Invalid header ' + secret), newBuildGitHubTrace())).toContain('GH_HEADER_INVALID');
    expect(buildGitHubFailure(new TypeError('Unexpected redirect ' + secret), newBuildGitHubTrace())).toContain('GH_REDIRECT_REJECTED');
    expect(buildGitHubFailure(new DOMException(secret, 'TimeoutError'), newBuildGitHubTrace())).toContain('GH_TIMEOUT');
  });
});
