// Pure response contract. Unknown, refused and truncated reviews never approve.
export const LEGACY_UNREADABLE = 'The reviewer reply could not be read, so this counts as not approved.';
export const REVIEW_FORMAT = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['approve', 'changes'] },
      summary: { type: 'string', description: 'One or two plain sentences, at most 600 characters.' },
    },
    required: ['verdict', 'summary'], additionalProperties: false,
  },
};

function parseReview(text) {
  try {
    const clean = typeof text === 'string' ? text.trim().replace(/^```json\s*\n([\s\S]*)\n```$/, '$1') : '';
    const v = JSON.parse(clean);
    if (v && typeof v === 'object' && !Array.isArray(v)
      && Object.keys(v).length === 2 && ['approve', 'changes'].includes(v.verdict)
      && typeof v.summary === 'string' && v.summary.trim().length > 0 && v.summary.length <= 600)
      return { verdict: v.verdict, summary: v.summary.trim(), kind: 'verdict' };
  } catch { /* fail closed */ }
  return { verdict: 'changes', summary: LEGACY_UNREADABLE, kind: 'unreadable' };
}

export function parseVerdict(text) {
  const { verdict, summary } = parseReview(text);
  return { verdict, summary };
}

export function readReviewResponse(vendor, body) {
  const stop = vendor === 'anthropic' ? body?.stop_reason : body?.choices?.[0]?.finish_reason;
  const blocks = vendor === 'anthropic' && Array.isArray(body?.content) ? body.content : [];
  const text = vendor === 'anthropic'
    ? blocks.filter(c => c?.type === 'text' && typeof c.text === 'string').map(c => c.text).join('')
    : body?.choices?.[0]?.message?.content;
  const refusal = vendor === 'anthropic' ? blocks.some(c => !['text', 'thinking', 'redacted_thinking'].includes(c?.type)) : Boolean(body?.choices?.[0]?.message?.refusal);
  const complete = !refusal && (vendor === 'anthropic' ? stop === 'end_turn' : vendor === 'openai' && stop === 'stop');
  const parsed = complete ? parseReview(text) : parseReview('');
  // Fixed enums/counts only: never log the provider text, reasoning or payload.
  const diagnostics = { vendor, stop: ['end_turn', 'stop', 'max_tokens', 'length', 'refusal', 'tool_use', 'tool_calls'].includes(stop) ? stop : 'unknown',
    textChars: typeof text === 'string' ? text.length : 0, blocks: blocks.length };
  return { ...parsed, diagnostics };
}

/** A manual retry is allowed only for a documented unreadable reply, never a
 * genuine verdict. All ordinary policy gates must separately pass first. */
export function mayRetryUnreadableReview({ pr, comments, requestedSha, requestedPr, eventName, status }) {
  if (eventName !== 'workflow_dispatch' || String(requestedPr) !== String(pr.number)
    || !/^[a-f0-9]{40}$/.test(requestedSha ?? '') || requestedSha !== pr.head.sha
    || status?.state !== 'failure'
    || !status.description?.includes(' changes - ' + LEGACY_UNREADABLE.slice(0, 50))) return false;
  const prefix = `<!-- canx-ai-review sha=${requestedSha}`;
  const latest = comments.filter(c => c.user?.login === 'github-actions[bot]' && c.user?.type === 'Bot'
    && (c.body?.startsWith(prefix + ' -->\n') || c.body?.startsWith(prefix + ' kind=')))
    .sort((a, b) => b.id - a.id)[0];
  if (!latest) return false;
  return latest.body.startsWith(prefix + ' kind=unreadable -->\n')
    || (latest.body.startsWith(prefix + ' -->\n') && latest.body.endsWith('\n\n' + LEGACY_UNREADABLE));
}
