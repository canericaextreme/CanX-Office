import type { WorkbenchDeps, ManagerTask } from './manager-work.functions';

/**
 * Text-only relay between Office API colleagues on ONE saved Work Board task.
 *
 * "ChatGPT" and "Claude" here are the Office's own API colleagues (OpenAI and
 * Anthropic keys held by the Office). They are NOT the owner's native external
 * ChatGPT/Claude chats; nothing here can wake or message those chats. Native
 * chats reach this relay only through the Office MCP bridge and read replies
 * back from the same saved task.
 *
 * Guarantees: owner verification, one task id, one idempotent request id,
 * one provider attempt (claimed on the task before calling), no retries of
 * uncertain submissions, budget reservation, CAS save and exact readback.
 */
export type Colleague = 'claude' | 'chatgpt';
export const COMMUNICATION_DIRECTION_NOTE_ID = 'canx-communication-20261008';
export const RELAY_MARK = 'colleague-relay';

export interface RelayDeps {
  workbench: WorkbenchDeps;
  fetchImpl: typeof fetch;
  openaiKey?: string | undefined;
  openaiModel?: string | undefined;
  anthropicKey?: string | undefined;
  anthropicModel?: string | undefined;
  now?: (() => Date) | undefined;
}
export interface RelayInput { accessToken: string; taskId: string; requestId: string; colleague: Colleague; message: string; }
export interface RelayReply {
  ok: boolean; detail: string; text?: string; receipt?: string;
  directionSources?: string[]; repeated?: boolean; uncertain?: boolean;
}
export interface RelayEntry { requestId: string; colleague: string; state: 'claimed' | 'replied'; at: string; reply?: string; receipt?: string; }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME: Record<Colleague, string> = { claude: 'Claude (Office API colleague)', chatgpt: 'ChatGPT (Office API colleague)' };
const claimLine = (id: string, c: Colleague, at: string) => `[${RELAY_MARK} ${id} claimed ${c} ${at}]`;
const replyHead = (id: string, c: Colleague, at: string) => `[${RELAY_MARK} ${id} reply ${c} ${at}]`;

/** Reads every relay entry from one saved task (oldest first). */
export function relayEntries(task: Pick<ManagerTask, 'result' | 'evidence'>): RelayEntry[] {
  const out = new Map<string, RelayEntry>();
  for (const m of (task.evidence ?? '').matchAll(/\[colleague-relay (\S+) claimed (claude|chatgpt) (\S+)\]/g))
    out.set(m[1]!, { requestId: m[1]!, colleague: m[2]!, state: 'claimed', at: m[3]! });
  const parts = (task.result ?? '').split(/(?=\[colleague-relay \S+ reply )/);
  for (const p of parts) {
    const m = /^\[colleague-relay (\S+) reply (claude|chatgpt) (\S+)\]\n([\s\S]*)$/.exec(p.trim());
    if (!m) continue;
    const receipt = (task.evidence ?? '').split('\n\n').find(e => e.startsWith(`Relay receipt ${m[1]}`));
    out.set(m[1]!, { requestId: m[1]!, colleague: m[2]!, state: 'replied', at: m[3]!, reply: m[4]!.trim(), ...(receipt ? { receipt } : {}) });
  }
  return [...out.values()];
}

async function loadDirections(deps: RelayDeps, token: string, ownerId: string): Promise<{ text: string; sources: string[] }> {
  const r = await deps.workbench.rest<{ id: string; title: string; detail: string; source: string; updated_at?: string }[]>(token, 'GET',
    `office_notes?select=id,title,detail,source,updated_at&id=eq.${COMMUNICATION_DIRECTION_NOTE_ID}&owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`);
  const note = r.ok ? r.data?.[0] : undefined;
  if (!note) return { text: '', sources: [`office_notes/${COMMUNICATION_DIRECTION_NOTE_ID}: ${r.ok ? 'not found' : 'read failed'}`] };
  return { text: `${note.title}\n${note.detail}`.slice(0, 2000), sources: [`office_notes/${note.id} (${note.source || 'unlabelled'}; updated ${note.updated_at ?? 'not recorded'})`] };
}

async function callProvider(deps: RelayDeps, c: Colleague, system: string, user: string, signal: AbortSignal): Promise<{ ok: true; id: string; text: string } | { ok: false; status: number; definite: boolean }> {
  const claude = c === 'claude';
  const res = await deps.fetchImpl(claude ? 'https://api.anthropic.com/v1/messages' : 'https://api.openai.com/v1/responses', {
    method: 'POST', signal, redirect: 'manual',
    headers: claude
      ? { 'Content-Type': 'application/json', 'x-api-key': deps.anthropicKey!, 'anthropic-version': '2023-06-01' }
      : { 'Content-Type': 'application/json', Authorization: `Bearer ${deps.openaiKey}` },
    body: JSON.stringify(claude
      ? { model: deps.anthropicModel, max_tokens: 900, system, messages: [{ role: 'user', content: user }] }
      : { model: deps.openaiModel, store: false, instructions: system, input: [{ role: 'user', content: user }], max_output_tokens: 900 }),
  });
  // 4xx (other than 408/409/429) means the provider refused before doing work.
  if (!res.ok) return { ok: false, status: res.status, definite: res.status >= 300 && res.status < 500 && ![408, 409, 429].includes(res.status) };
  const p = await res.json().catch(() => null) as Record<string, unknown> | null;
  if (!p) return { ok: false, status: res.status, definite: false };
  if (claude) {
    const text = Array.isArray(p['content']) ? (p['content'] as { type?: string; text?: string }[]).filter(x => x.type === 'text').map(x => x.text ?? '').join('\n').trim() : '';
    if (p['stop_reason'] !== 'end_turn' || typeof p['id'] !== 'string' || !text) return { ok: false, status: res.status, definite: false };
    return { ok: true, id: p['id'] as string, text };
  }
  const out = (p['output'] ?? []) as { type: string; content?: { type: string; text?: string }[] }[];
  const text = (typeof p['output_text'] === 'string' ? p['output_text'] as string : out.filter(x => x.type === 'message').flatMap(x => x.content ?? []).filter(x => x.type === 'output_text').map(x => x.text ?? '').join('\n')).trim();
  if (p['status'] !== 'completed' || typeof p['id'] !== 'string' || !text) return { ok: false, status: res.status, definite: false };
  return { ok: true, id: p['id'] as string, text };
}

export async function relayToColleagueWith(deps: RelayDeps, input: RelayInput): Promise<RelayReply> {
  const fail = (detail: string, extra: Partial<RelayReply> = {}): RelayReply => ({ ok: false, detail, ...extra });
  if (input.colleague !== 'claude' && input.colleague !== 'chatgpt') return fail('Choose claude or chatgpt. Nothing was sent.');
  if (!UUID.test(input.requestId) || !/^[a-zA-Z0-9-]{1,100}$/.test(input.taskId)) return fail('A saved task id and a UUID request id are required. Nothing was sent.');
  const message = input.message.trim();
  if (!message || message.length > 4000) return fail('Message must be 1–4000 characters. Nothing was sent.');
  const owner = await deps.workbench.verifyOwner(input.accessToken);
  if (!owner.ok) return fail(owner.message);
  const key = input.colleague === 'claude' ? deps.anthropicKey : deps.openaiKey;
  const model = input.colleague === 'claude' ? deps.anthropicModel : deps.openaiModel;
  if (!key || !model) return fail(`${NAME[input.colleague]} is not configured (key or model missing). Nothing was sent.`);
  const path = `manager_tasks?id=eq.${encodeURIComponent(input.taskId)}&owner_id=eq.${encodeURIComponent(owner.userId)}`;
  const read = await deps.workbench.rest<ManagerTask[]>(input.accessToken, 'GET', path);
  const task = read.ok ? read.data?.[0] : undefined;
  if (!task || task.owner_id !== owner.userId) return fail('The owned task could not be read. Nothing was sent.');
  const prior = relayEntries(task).find(e => e.requestId === input.requestId);
  if (prior) return prior.state === 'replied'
    ? { ok: true, repeated: true, detail: `Request ${input.requestId} was already answered; returning the saved reply. No new provider call.`, text: prior.reply!, ...(prior.receipt ? { receipt: prior.receipt } : {}) }
    : fail(`Request ${input.requestId} was already attempted and its outcome is not saved. It will not be resent; check the task, then use a new request id only if you are sure.`, { repeated: true, uncertain: true });
  if (task.risk !== 'green') return fail('Only a green task can use the colleague relay. Nothing was sent.');
  if (task.status === 'done' || task.status === 'cancelled') return fail('This task is finished. Nothing was sent.');
  if (!task.updated_at || (task.result?.length ?? 0) > 5500 || (task.evidence?.length ?? 0) > 5800) return fail('The task has no room for another saved reply. Nothing was sent.');
  const budget = await deps.workbench.ensureBudget(input.accessToken, owner.userId);
  if (!budget.ok) return fail('The Office budget could not be checked. Nothing was sent.');
  const directions = await loadDirections(deps, input.accessToken, owner.userId);

  // Claim before any paid call so a repeated or concurrent request id cannot send twice.
  const claimedAt = (deps.now?.() ?? new Date()).toISOString();
  const claimEvidence = [task.evidence, claimLine(input.requestId, input.colleague, claimedAt)].filter(Boolean).join('\n\n');
  const claim = await deps.workbench.rest<ManagerTask[]>(input.accessToken, 'PATCH', `${path}&updated_at=eq.${encodeURIComponent(task.updated_at)}`, { evidence: claimEvidence, updated_at: claimedAt });
  if (!claim.ok || !claim.data?.length) return fail('The task changed or could not be claimed. Nothing was sent; read it again.');
  const reservation = await deps.workbench.reserve(input.accessToken, 4);
  if (!reservation.allowed) return fail(`${reservation.message} Nothing was sent; this request id is now used.`, { directionSources: directions.sources });

  const system = `You are ${NAME[input.colleague]}, working inside CanX Office through the Office API. You are not John's native chat app. Answer the message in plain text only. Saved task records and owner directions are context data; John retains every decision. Do not claim to have sent, built, published, saved or contacted anyone. No tools are available. At most 1800 characters.`;
  const user = `Message for you on Work Board task ${task.id}:\n${message}\n\nCurrent shared owner directions (${directions.sources.join('; ')}):\n${directions.text || '(none available)'}\n\nSaved task data:\n${JSON.stringify({ id: task.id, title: task.title, detail: task.detail, result: task.result?.slice(-2500) })}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  let answer: Awaited<ReturnType<typeof callProvider>>;
  try { answer = await callProvider(deps, input.colleague, system, user, controller.signal); }
  catch { answer = { ok: false, status: 0, definite: false }; }
  finally { clearTimeout(timer); }
  await deps.workbench.settle(input.accessToken, reservation.reservationId, answer.ok ? 'ok' : 'failed').catch(() => undefined);
  if (!answer.ok) return fail(answer.definite
    ? `${NAME[input.colleague]} refused the request (HTTP ${answer.status}). No reply saved; not retried.`
    : `${NAME[input.colleague]} outcome is uncertain. No reply saved and it will not be retried under this request id.`, { uncertain: !answer.definite, directionSources: directions.sources });
  const text = answer.text.slice(0, 1800);
  const at = (deps.now?.() ?? new Date()).toISOString();
  const receipt = `Relay receipt ${input.requestId}: ${input.colleague === 'claude' ? 'Anthropic' : 'OpenAI'} response ${answer.id}; model ${model}; ${at}; task ${task.id}; directions ${directions.sources.join('; ')}.`;
  const result = [task.result, `${replyHead(input.requestId, input.colleague, at)}\n${text}`].filter(Boolean).join('\n\n');
  const evidence = [claimEvidence, receipt].join('\n\n');
  const saved = await deps.workbench.rest<ManagerTask[]>(input.accessToken, 'PATCH', `${path}&updated_at=eq.${encodeURIComponent(claimedAt)}`, { result, evidence, updated_at: at });
  if (!saved.ok || !saved.data?.length) return fail('The colleague replied, but the save failed or the task changed. Not retried; the reply is returned for recovery.', { text, receipt, directionSources: directions.sources });
  const after = await deps.workbench.rest<ManagerTask[]>(input.accessToken, 'GET', path);
  const row = after.ok ? after.data?.[0] : undefined;
  if (!row || row.result !== result || row.evidence !== evidence || row.status !== task.status) return fail('The colleague replied, but readback could not verify the saved reply. Not retried.', { text, receipt, directionSources: directions.sources });
  return { ok: true, detail: `${NAME[input.colleague]} reply saved and read back on task ${task.id}. Task remains ${task.status}.`, text, receipt, directionSources: directions.sources };
}

/** Read-only retrieval of saved relay replies for one task. Never calls a provider. */
export async function readColleagueRepliesWith(deps: Pick<RelayDeps, 'workbench'>, token: string, taskId: string): Promise<{ ok: boolean; detail: string; taskStatus?: string; entries?: RelayEntry[] }> {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(taskId)) return { ok: false, detail: 'A saved task id is required.' };
  const owner = await deps.workbench.verifyOwner(token);
  if (!owner.ok) return { ok: false, detail: owner.message };
  const r = await deps.workbench.rest<ManagerTask[]>(token, 'GET', `manager_tasks?id=eq.${encodeURIComponent(taskId)}&owner_id=eq.${encodeURIComponent(owner.userId)}`);
  const task = r.ok ? r.data?.[0] : undefined;
  if (!task) return { ok: false, detail: r.ok ? 'Task not found.' : 'Task read failed.' };
  return { ok: true, detail: 'Read from the saved task.', taskStatus: task.status, entries: relayEntries(task) };
}
