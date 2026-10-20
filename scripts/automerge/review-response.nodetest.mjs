import test from 'node:test';
import assert from 'node:assert/strict';
import { askReviewer } from './run.mjs';
import { decide, REVIEW_CONTEXT } from './policy.mjs';
import { LEGACY_UNREADABLE, REVIEW_FORMAT, parseVerdict, readReviewResponse, mayRetryUnreadableReview } from './review-response.mjs';

const json = JSON.stringify({ verdict: 'approve', summary: 'Safe to merge.' });
const anthropic = (extra = {}) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: json }], ...extra });

test('the existing review request asks for a schema, without raising model or token allowance', async () => {
  let request;
  const result = await askReviewer('anthropic', { title: 't', body: '' }, 'FULL DIFF', {
    config: { ANTHROPIC_API_KEY: 'fixture-only' },
    fetchImpl: async (_url, init) => { request = JSON.parse(init.body); return new Response(JSON.stringify(anthropic())); },
  });
  assert.deepEqual(request.output_config.format, REVIEW_FORMAT);
  assert.equal(request.max_tokens, 800);
  assert.equal(request.model, 'claude-sonnet-5-5');
  assert.equal(result.verdict, 'approve');
  assert.equal(result.kind, 'verdict');
});

test('an oversized diff stops before the provider, instead of reviewing a truncated copy', async () => {
  let called = false;
  await assert.rejects(askReviewer('anthropic', {}, 'x'.repeat(60001), {
    config: {}, fetchImpl: async () => { called = true; },
  }), /full diff exceeds/);
  assert.equal(called, false);
});

test('truncation, refusal, unknown completion and unexpected blocks never approve even with valid JSON', () => {
  for (const stop_reason of ['max_tokens', 'refusal', 'tool_use', null, undefined]) {
    const result = readReviewResponse('anthropic', anthropic({ stop_reason }));
    assert.equal(result.verdict, 'changes');
    assert.equal(result.kind, 'unreadable');
  }
  assert.equal(readReviewResponse('anthropic', anthropic({ content: [{ type: 'text', text: json }, { type: 'tool_use' }] })).kind, 'unreadable');
  assert.equal(readReviewResponse('anthropic', { error: 'private error' }).kind, 'unreadable');
  assert.equal(readReviewResponse('openai', { choices: [{ finish_reason: 'length', message: { content: json } }] }).verdict, 'changes');
  assert.equal(readReviewResponse('openai', { choices: [{ finish_reason: 'stop', message: { content: json, refusal: 'refused' } }] }).verdict, 'changes');
  assert.equal(readReviewResponse('openai', { choices: [{ finish_reason: 'stop', message: { content: json } }] }).verdict, 'approve');
});

test('malformed, unbounded, extra-field and embedded JSON approvals fail closed', () => {
  for (const text of ['', 'prefix ' + json, json + json, '{"verdict":"approve"}',
    JSON.stringify({ verdict: 'approve', summary: '' }),
    JSON.stringify({ verdict: 'approve', summary: 'x'.repeat(601) }),
    JSON.stringify({ verdict: 'approve', summary: 'ok', extra: true }),
    JSON.stringify({ verdict: 'APPROVE', summary: 'ok' })]) {
    assert.equal(parseVerdict(text).verdict, 'changes');
  }
});

const sha = 'a'.repeat(40);
const prefix = `<!-- canx-ai-review sha=${sha}`;
const bot = { login: 'github-actions[bot]', type: 'Bot' };
const legacy = { id: 1, user: bot, body: prefix + ' -->\n**Independent review: changes needed.**\n\n' + LEGACY_UNREADABLE };
const retry = (extra = {}) => ({ pr: { number: 190, head: { sha } }, comments: [legacy], requestedSha: sha,
  requestedPr: '190', eventName: 'workflow_dispatch', status: { state: 'failure', description: 'anthropic:model changes - ' + LEGACY_UNREADABLE }, ...extra });

test('only an explicit exact-commit manual retry of a bot-documented unreadable result is eligible', () => {
  assert.equal(mayRetryUnreadableReview(retry()), true);
  for (const extra of [{ requestedSha: 'b'.repeat(40) }, { requestedSha: '' }, { requestedPr: '191' },
    { eventName: 'schedule' }, { eventName: 'pull_request_target' }, { comments: [] },
    { status: { state: 'success' } }, { status: { state: 'failure', description: 'anthropic:model changes - Bug found' } },
    { comments: [{ ...legacy, user: { login: 'someone', type: 'User' } }] }]) {
    assert.equal(mayRetryUnreadableReview(retry(extra)), false);
  }
});

test('a later substantive rejection cannot be replaced by retrying an earlier unreadable result', () => {
  const rejection = { id: 2, user: bot, body: prefix + ' kind=verdict -->\nChanges needed.\n\n' + LEGACY_UNREADABLE };
  assert.equal(mayRetryUnreadableReview(retry({ comments: [legacy, rejection] })), false);
  // A real verdict quoting the old error is still a real verdict.
  assert.equal(readReviewResponse('anthropic', anthropic({ content: [{ type: 'text', text: JSON.stringify({ verdict: 'changes', summary: LEGACY_UNREADABLE }) }] })).kind, 'verdict');
});

test('retry eligibility alone cannot admit a protected file, failed check, stale approval or requested changes', () => {
  const facts = { pr: { number: 190, state: 'open', draft: false, mergeable: true, base: { ref: 'main' }, head: { ref: 'chatgpt/fix', sha }, labels: [{ name: 'canx:auto-merge' }] },
    files: [{ filename: 'src/components/office/Desk.tsx', additions: 1, deletions: 0 }],
    checkRuns: [{ name: 'pr-checks', status: 'completed', conclusion: 'success' }], statuses: [], reviews: [] };
  assert.equal(decide(facts).action, 'review');
  assert.notEqual(decide({ ...facts, files: [{ filename: '.github/workflows/canx-merge-robot.yml' }] }).action, 'review');
  assert.notEqual(decide({ ...facts, checkRuns: [{ name: 'pr-checks', status: 'completed', conclusion: 'failure' }] }).action, 'review');
  assert.notEqual(decide({ ...facts, reviews: [{ user: { login: 'reviewer' }, state: 'CHANGES_REQUESTED' }] }).action, 'review');
  assert.notEqual(decide({ ...facts, statuses: [{ context: REVIEW_CONTEXT, state: 'failure', description: 'anthropic:model changes - Bug found' }] }).action, 'merge');
});

test('diagnostics contain counts and fixed codes, never provider content', () => {
  const result = readReviewResponse('anthropic', anthropic({ stop_reason: 'secret-provider-error', content: [{ type: 'text', text: 'private source code' }] }));
  assert.deepEqual(result.diagnostics, { vendor: 'anthropic', stop: 'unknown', textChars: 19, blocks: 1 });
  assert.equal(JSON.stringify(result).includes('private source code'), false);
});
