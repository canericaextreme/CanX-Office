// CanX Office merge robot rules (issue #142). Pure functions, no network, so every gate is unit-tested.
// The robot only ever merges a pull request when ALL of these are true:
//   1. John's authorization is recorded on it (label `canx:auto-merge`), it is not a draft and targets main.
//   2. Every changed file is routine (see classifyFiles); anything sensitive, large or unknown goes to John.
//   3. Every check on the latest commit finished green, including the general "CanX PR checks" build.
//   4. GitHub says it merges cleanly and nobody asked for changes.
//   5. An independent reviewer from the OTHER AI company approved this exact commit
//      (Claude-built work is reviewed by OpenAI, ChatGPT/Codex-built work by Anthropic).

export const OPT_IN_LABEL = 'canx:auto-merge';
export const REVIEW_CONTEXT = 'canx/independent-review';
export const REVIEW_AUTHOR = 'github-actions[bot]';
export const REQUIRED_CHECK = 'pr-checks';
export const ROBOT_CHECK = 'auto-merge';
export const STATE_LABELS = {
  'waiting-checks': 'canx:state-waiting-checks',
  'waiting-review': 'canx:state-waiting-review',
  'owner-review': 'canx:state-owner-review',
  blocked: 'canx:state-blocked',
  merged: 'canx:state-merged',
};
export const LIMITS = { maxFiles: 20, maxChangedLines: 600 };

// Routine work lives only in app code, docs, tests and images.
const ROUTINE_PREFIXES = ['src/', 'docs/', 'tests/', 'public/'];
// Names that mean money, legal, access, secrets, builders, data shape or policy. Always John's call.
const SENSITIVE = [
  [/auth|login|session-token|mfa|aal2/i, 'sign-in or authentication'],
  [/secret|credential|token|\.env|api-?key/i, 'secrets or credentials'],
  [/permission|consent|grant|access|viewer|security|rls|polic(y|ies)/i, 'permissions, security or policy'],
  [/billing|subscription|finance|payment|stripe|invoice|budget|ai-limits|spend/i, 'money, budgets or subscriptions'],
  [/legal/i, 'legal'],
  [/migration|\.sql$|schema/i, 'database structure'],
  [/office-mcp|office-view|office-consent|canx-backend|supabase/i, 'the Office connection gateway'],
  [/builds?\.(server|functions)|builder|colleague-relay|scheduled|worker|merge-wake|automerge/i, 'paid builders or automation'],
  [/gmail|mailbox|google-drive/i, 'connected mail or Drive accounts'],
  [/(^|\/)AGENTS\.md$|(^|\/)CLAUDE\.md$/i, 'standing AI instructions'],
];

export function classifyFiles(files) {
  const reasons = [];
  if (!files.length) reasons.push('no changed files');
  let lines = 0;
  for (const f of files) {
    lines += (f.additions ?? 0) + (f.deletions ?? 0);
    const names = [f.filename, f.previous_filename].filter(Boolean);
    for (const name of names) {
      if (!ROUTINE_PREFIXES.some(p => name.startsWith(p))) reasons.push(`${name}: outside routine areas (src, docs, tests, public)`);
      for (const [re, why] of SENSITIVE) if (re.test(name)) { reasons.push(`${name}: touches ${why}`); break; }
    }
    if (f.status === 'removed') reasons.push(`${f.filename}: deletes a file`);
    if (f.status === 'renamed') reasons.push(`${f.filename}: moves a file`);
  }
  if (files.length > LIMITS.maxFiles) reasons.push(`${files.length} files changed (routine limit ${LIMITS.maxFiles})`);
  if (lines > LIMITS.maxChangedLines) reasons.push(`${lines} lines changed (routine limit ${LIMITS.maxChangedLines})`);
  return { routine: reasons.length === 0, reasons: [...new Set(reasons)] };
}

// Which AI company built it: the branch name first, else a "Built-by:" line in the description.
export function builderVendor(pr) {
  const ref = pr.head?.ref ?? '';
  if (/^claude\//.test(ref)) return 'anthropic';
  if (/^(codex|chatgpt|openai|canx)\//.test(ref)) return 'openai';
  const said = /^built-by:\s*(.+)$/im.exec(pr.body ?? '')?.[1]?.toLowerCase() ?? '';
  if (/claude|anthropic/.test(said)) return 'anthropic';
  if (/chatgpt|codex|openai|gpt/.test(said)) return 'openai';
  return null;
}

export const reviewerFor = vendor => (vendor === 'anthropic' ? 'openai' : vendor === 'openai' ? 'anthropic' : null);

// statuses: GitHub statuses for the head commit, newest first, with creator. Description format: "<vendor>:<model> approve|changes - ...".
export function reviewState(statuses, builder) {
  const s = statuses.find(x => x.context === REVIEW_CONTEXT);
  if (!s) return { state: 'missing' };
  const vendor = /^(anthropic|openai):/.exec(s.description ?? '')?.[1] ?? null;
  if (s.state === 'pending') return { state: 'missing' };
  if (s.state !== 'success') return { state: 'changes', detail: s.description ?? 'reviewer asked for changes' };
  // Only the robot itself posts review results. Anyone else with write access can post a status with
  // the same name, so a success from another author is never an approval.
  if (s.creator?.login !== REVIEW_AUTHOR) return { state: 'untrusted', detail: `the review result was posted by ${s.creator?.login ?? 'an unknown author'}, not the merge robot` };
  if (!vendor || vendor === builder) return { state: 'not-independent', detail: `review by ${vendor ?? 'unknown'} is not independent of the builder (${builder})` };
  return { state: 'approved', detail: s.description };
}

const ok = c => c.status === 'completed' && ['success', 'neutral', 'skipped'].includes(c.conclusion);

// Returns { state, reasons, action } where action is one of: ignore, label, review, merge.
export function decide({ pr, files, checkRuns, statuses, reviews }) {
  const out = (state, reasons, action = 'label') => ({ state, reasons, action });
  if (pr.state !== 'open' || pr.base?.ref !== 'main') return out('ignored', ['not an open pull request into main'], 'ignore');
  if (!(pr.labels ?? []).some(l => l.name === OPT_IN_LABEL)) return out('ignored', [`no ${OPT_IN_LABEL} label`], 'ignore');
  if (pr.draft) return out('ignored', ['still a draft'], 'ignore');

  const builder = builderVendor(pr);
  const cls = classifyFiles(files);
  const ownerReasons = [...cls.reasons];
  if (!builder) ownerReasons.push('could not tell which AI built it (branch claude/, codex/, chatgpt/ or canx/, or a "Built-by:" line)');
  if (ownerReasons.length) return out('owner-review', ownerReasons);

  const latest = new Map();
  for (const r of reviews ?? []) if (r.state !== 'COMMENTED') latest.set(r.user?.login, r.state);
  if ([...latest.values()].includes('CHANGES_REQUESTED')) return out('blocked', ['a reviewer asked for changes on GitHub']);

  const runs = (checkRuns ?? []).filter(c => c.name !== ROBOT_CHECK);
  const failed = runs.filter(c => c.status === 'completed' && !ok(c));
  if (failed.length) return out('blocked', failed.map(c => `check "${c.name}" ${c.conclusion}`));
  const pending = runs.filter(c => c.status !== 'completed');
  if (!runs.some(c => c.name === REQUIRED_CHECK)) return out('waiting-checks', [`the "${REQUIRED_CHECK}" build has not reported yet`]);
  if (pending.length) return out('waiting-checks', pending.map(c => `check "${c.name}" still running`));
  const other = (statuses ?? []).filter(s => s.context !== REVIEW_CONTEXT);
  if (other.some(s => s.state === 'failure' || s.state === 'error')) return out('blocked', ['a commit status failed']);
  if (other.some(s => s.state === 'pending')) return out('waiting-checks', ['a commit status is still pending']);

  if (pr.mergeable === false) return out('blocked', ['it conflicts with main and needs a rebase']);
  if (pr.mergeable == null) return out('waiting-checks', ['GitHub is still working out whether it merges cleanly']);

  const review = reviewState(statuses ?? [], builder);
  if (review.state === 'changes') return out('blocked', [`independent review asked for changes: ${review.detail}`]);
  if (review.state === 'untrusted') return out('owner-review', [review.detail]);
  if (review.state === 'not-independent') return out('waiting-review', [review.detail], 'review');
  if (review.state === 'missing') return out('waiting-review', [`needs an independent ${reviewerFor(builder)} review of this exact commit`], 'review');
  return out('ready', [`all gates passed; ${review.detail}`], 'merge');
}
