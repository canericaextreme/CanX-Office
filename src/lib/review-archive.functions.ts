import { createServerFn } from '@tanstack/react-start';
import { historyDeps, type HistoryDeps } from './manager-history.functions';
import type { ClaudeReviewReply } from './claude-review.functions';

export async function archiveReviewWith(deps: HistoryDeps, token: string, reply: ClaudeReviewReply) {
  const owner = await deps.verify(token);
  if (!owner.ok || !reply.ok || !reply.structuredComplete) return { saved: false, id: null };
  const id = crypto.randomUUID();
  const written = await deps.write(token, { owner_id: owner.userId, entity: 'claude_review', entity_id: id,
    action: 'review.saved', before: {}, after: { ...reply, archive: undefined } });
  if (!written.ok) return { saved: false, id: null };
  const checked = await deps.read(token, `manager_changes?owner_id=eq.${encodeURIComponent(owner.userId)}&entity=eq.claude_review&entity_id=eq.${id}&select=entity_id&limit=1`);
  const saved = checked.ok && Array.isArray(checked.body) && checked.body.length === 1;
  return { saved, id: saved ? id : null };
}
export const loadReviewArchive = createServerFn({ method: 'POST' })
  .inputValidator((raw: { accessToken: string }) => ({ accessToken: typeof raw?.accessToken === 'string' ? raw.accessToken.slice(0,4000) : '' }))
  .handler(async ({data}) => {
    const deps = await historyDeps(); const owner = await deps.verify(data.accessToken);
    if (!owner.ok) return { ok: false, reviews: [], message: owner.message };
    const result = await deps.read(data.accessToken, `manager_changes?owner_id=eq.${encodeURIComponent(owner.userId)}&entity=eq.claude_review&select=entity_id,after,at&order=id.desc&limit=30`);
    return { ok: result.ok, reviews: result.ok && Array.isArray(result.body) ? result.body as {entity_id:string;after:ClaudeReviewReply;at:string}[] : [], message: result.ok ? 'Saved reviews loaded.' : 'Review archive could not be read.' };
  });
