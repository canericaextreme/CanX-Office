import { ROOMS } from './office-data';
import type { WorkbenchDeps, JsonObject } from './manager-work.functions';

/** Narrow owner-scoped report writes; never accepts arbitrary table or column names. */
export async function writeRoomReportWith(deps: WorkbenchDeps, token: string, args: Record<string, unknown>, conversationSummary = false) {
  const fail = (message: string) => ({ ok: false, message });
  const owner = await deps.verifyOwner(token);
  if (!owner.ok) return fail('Report not saved: owner verification is required.');
  const room = ROOMS.find(r => r.id === args['room']);
  const title = typeof args['title'] === 'string' ? args['title'].trim() : '';
  const detail = typeof args['detail'] === 'string' ? args['detail'] : '';
  if (!room || !title || title.length > 300 || !detail || detail.length > 2000 || !['top', 'bottom'].includes(String(args['position']))) return fail('Report not saved: choose a valid room, position, title and report of up to 2,000 characters.');
  const existing = typeof args['report_id'] === 'string' ? args['report_id'] : '';
  const id = existing || `report-${crypto.randomUUID()}`;
  const query = `office_notes?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(owner.userId)}`;
  if (existing) {
    const before = await deps.rest<JsonObject[]>(token, 'GET', query);
    if (!before.ok || !before.data?.[0] || !String(before.data[0]['source']).startsWith('Data room report:')) return fail('Report not changed: no matching Data room report belongs to this account.');
  }
  const source = conversationSummary ? "CanX Brain:Data conversation summary" : `Data room report:${room.id}:${args['position']}`;
  const row = { title, detail, source };
  const saved = await deps.rest(token, existing ? 'PATCH' : 'POST', existing ? query : 'office_notes', existing ? row : {
    ...row, id, owner_id: owner.userId, kind: 'task', owner_name: 'Data', provenance: 'ai-proposal', created_at: new Date().toISOString(),
  });
  if (!saved.ok) return fail('Report could not be saved.');
  const read = await deps.rest<JsonObject[]>(token, 'GET', query);
  const actual = read.data?.[0];
  if (!read.ok || actual?.['title'] !== title || actual?.['detail'] !== detail || actual?.['source'] !== source) return fail('Report write was attempted, but read-back could not confirm it. Check the room before retrying.');
  if (conversationSummary) return { ok: true, message: `Saved and read back conversation summary "${title}" in CanX Brain’s saved conversation memory. Record id: ${id}.` };
  return { ok: true, message: `Saved and read back report "${title}" in ${room.label}, at the ${args['position']}. Report id: ${id}.` };
}
