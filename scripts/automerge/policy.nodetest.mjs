// Merge robot gate tests (issue #142): green routine -> merge, failed check -> blocked,
// risky -> John, no independent review -> wait. Run: node --test scripts/automerge/*.nodetest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, classifyFiles, builderVendor, reviewState, REVIEW_CONTEXT } from './policy.mjs';
import { parseVerdict } from './run.mjs';

const pr = (over = {}) => ({
  number: 7, state: 'open', draft: false, mergeable: true, title: 't', body: '',
  base: { ref: 'main' }, head: { ref: 'claude/fix-elsie', sha: 'abc1234' },
  labels: [{ name: 'canx:auto-merge' }], ...over,
});
const file = (filename, over = {}) => ({ filename, status: 'modified', additions: 5, deletions: 2, ...over });
const green = [{ name: 'pr-checks', status: 'completed', conclusion: 'success' }];
const robot = { login: 'github-actions[bot]', type: 'Bot' };
const approvedBy = (vendor, creator = robot) => [{ context: REVIEW_CONTEXT, state: 'success', description: `${vendor}:model approve - fine`, creator }];
const facts = (over = {}) => ({ pr: pr(), files: [file('src/components/office/Desk.tsx')], checkRuns: green, statuses: approvedBy('openai'), reviews: [], ...over });

test('green routine change reviewed by the other company merges', () => {
  assert.equal(decide(facts()).action, 'merge');
});

test('without the opt-in label or as a draft the robot does nothing', () => {
  assert.equal(decide(facts({ pr: pr({ labels: [] }) })).action, 'ignore');
  assert.equal(decide(facts({ pr: pr({ draft: true }) })).action, 'ignore');
  assert.equal(decide(facts({ pr: pr({ base: { ref: 'other' } }) })).action, 'ignore');
});

test('a failed check blocks the merge', () => {
  const d = decide(facts({ checkRuns: [...green, { name: 'Elsie recall validation', status: 'completed', conclusion: 'failure' }] }));
  assert.equal(d.state, 'blocked');
  assert.match(d.reasons[0], /Elsie recall validation/);
});

test('missing or running checks wait', () => {
  assert.equal(decide(facts({ checkRuns: [] })).state, 'waiting-checks');
  assert.equal(decide(facts({ checkRuns: [...green, { name: 'x', status: 'in_progress', conclusion: null }] })).state, 'waiting-checks');
  assert.equal(decide(facts({ pr: pr({ mergeable: null }) })).state, 'waiting-checks');
});

test("the robot's own check never counts", () => {
  assert.equal(decide(facts({ checkRuns: [...green, { name: 'auto-merge', status: 'in_progress' }] })).action, 'merge');
});

test('conflicts and requested changes block', () => {
  assert.equal(decide(facts({ pr: pr({ mergeable: false }) })).state, 'blocked');
  assert.equal(decide(facts({ reviews: [{ user: { login: 'a' }, state: 'CHANGES_REQUESTED' }] })).state, 'blocked');
});

test('high-risk changes go to John, never merge', () => {
  for (const name of [
    '.github/workflows/canx-merge-robot.yml', 'supabase/migrations/0009_x.sql', 'src/lib/finance-receipts.ts',
    'src/lib/subscriptions-skill-audit.ts', 'src/lib/auth.functions.ts', 'src/lib/legal-room.ts', 'package.json',
    'src/lib/claude-builds.server.ts', 'src/lib/assistant-access.ts', 'AGENTS.md', 'src/lib/AGENTS.md', 'scripts/automerge/policy.mjs',
  ]) {
    const d = decide(facts({ files: [file(name)] }));
    assert.equal(d.state, 'owner-review', name);
    assert.equal(d.action, 'label', name);
  }
});

test('deleting, moving or large changes go to John', () => {
  assert.equal(decide(facts({ files: [file('src/components/A.tsx', { status: 'removed' })] })).state, 'owner-review');
  assert.equal(decide(facts({ files: [file('src/components/B.tsx', { status: 'renamed', previous_filename: 'src/components/A.tsx' })] })).state, 'owner-review');
  assert.equal(decide(facts({ files: [file('src/components/A.tsx', { additions: 700 })] })).state, 'owner-review');
  assert.equal(decide(facts({ files: Array.from({ length: 21 }, (_, i) => file(`docs/n${i}.md`)) })).state, 'owner-review');
});

test('owner review wins even when everything else is green', () => {
  const d = decide(facts({ files: [file('src/components/A.tsx'), file('src/lib/stripe-webhook.ts')] }));
  assert.equal(d.state, 'owner-review');
  assert.equal(d.reasons.length, 1);
});

test('an unknown builder goes to John', () => {
  assert.equal(decide(facts({ pr: pr({ head: { ref: 'feature/x', sha: 'a' } }) })).state, 'owner-review');
});

test('review must come from the other AI company and match this commit', () => {
  assert.equal(decide(facts({ statuses: [] })).action, 'review');
  assert.equal(decide(facts({ statuses: approvedBy('anthropic') })).state, 'waiting-review');
  assert.equal(decide(facts({ statuses: [{ context: REVIEW_CONTEXT, state: 'success', description: 'looks fine', creator: robot }] })).state, 'waiting-review');
  assert.equal(decide(facts({ statuses: [{ context: REVIEW_CONTEXT, state: 'failure', description: 'openai:m changes - bug' }] })).state, 'blocked');
  const codex = facts({ pr: pr({ head: { ref: 'codex/office-12', sha: 'b' } }), statuses: approvedBy('anthropic') });
  assert.equal(decide(codex).action, 'merge');
});

test('builder identity', () => {
  assert.equal(builderVendor({ head: { ref: 'claude/x' } }), 'anthropic');
  assert.equal(builderVendor({ head: { ref: 'chatgpt/x' } }), 'openai');
  assert.equal(builderVendor({ head: { ref: 'canx/x' } }), 'openai');
  assert.equal(builderVendor({ head: { ref: 'elsie/x' }, body: 'Built-by: Codex' }), 'openai');
  assert.equal(builderVendor({ head: { ref: 'claude/x' }, body: 'Built-by: ChatGPT' }), 'anthropic');
  assert.equal(reviewState([], 'anthropic').state, 'missing');
});

test('routine areas', () => {
  assert.equal(classifyFiles([file('docs/canx-merge-robot-demo.md')]).routine, true);
  assert.equal(classifyFiles([file('src/components/office/OfficeManager.tsx')]).routine, true);
  assert.equal(classifyFiles([]).routine, false);
});

test('reviewer replies that cannot be read count as not approved', () => {
  assert.deepEqual(parseVerdict('{"verdict":"approve","summary":"ok"}'), { verdict: 'approve', summary: 'ok' });
  assert.equal(parseVerdict('Sure! ```json\n{"verdict":"changes","summary":"bug"}\n```').verdict, 'changes');
  assert.equal(parseVerdict('I approve').verdict, 'changes');
  assert.equal(parseVerdict('{"verdict":"yes"}').verdict, 'changes');
});

test('a review approval posted by anyone but the robot is never trusted', () => {
  assert.equal(decide(facts()).action, 'merge');
  for (const creator of [{ login: 'canericaextreme', type: 'User' }, { login: 'some-app[bot]', type: 'Bot' }, undefined, null]) {
    const d = decide(facts({ statuses: [{ ...approvedBy('openai')[0], creator }] }));
    assert.notEqual(d.action, 'merge');
    assert.notEqual(d.action, 'review');
    assert.equal(d.state, 'owner-review');
  }
  // A failure from anyone still blocks, so a bad actor can delay but never approve.
  assert.equal(decide(facts({ statuses: [{ context: REVIEW_CONTEXT, state: 'failure', description: 'openai:m changes - x', creator: { login: 'x' } }] })).state, 'blocked');
});
