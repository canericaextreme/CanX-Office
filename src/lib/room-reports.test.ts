import { expect, it, vi } from 'vitest';
import { writeRoomReportWith } from './room-reports';
import type { WorkbenchDeps } from './manager-work.functions';
const args = { room: 'brain', title: 'Conversation summary', detail: 'Speech is still unverified.', position: 'top' };
function fixture(authorized = true, readback = true) {
 let saved: unknown;
 const rest = vi.fn(async (_token, method, _path, body) => {
  if (method === 'POST') saved = body;
  return { ok: true, data: method === 'GET' ? (readback && saved ? [saved] : []) : [] };
 });
 return { rest, deps: { verifyOwner: async () => ({ ok: authorized, userId: 'owner' }), rest } as unknown as WorkbenchDeps };
}
it('requires owner verification before any database access', async () => {
 const {deps, rest} = fixture(false);
 expect((await writeRoomReportWith(deps, 'token', args)).ok).toBe(false);
 expect(rest).not.toHaveBeenCalled();
});
it('saves a Brain summary and verifies the exact read-back', async () => {
 const {deps, rest} = fixture();
 const result = await writeRoomReportWith(deps, 'token', args);
 expect(result.ok).toBe(true);
 expect(result.message).toContain('Report id: report-');
 expect(rest.mock.calls[0]?.[3]).toMatchObject({owner_id:'owner', source:'Data room report:brain:top', detail:args.detail});
});
it('does not claim success when read-back is absent', async () => {
 const {deps} = fixture(true, false);
 expect((await writeRoomReportWith(deps, 'token', args)).ok).toBe(false);
});
it('cannot move or overwrite a non-report record', async () => {
 const {deps, rest} = fixture();
 expect((await writeRoomReportWith(deps, 'token', {...args, report_id:'other-note'})).ok).toBe(false);
 expect(rest.mock.calls.every(call => call[1] === 'GET')).toBe(true);
});
it('rejects an unknown room before writes', async () => {
 const {deps, rest} = fixture();
 expect((await writeRoomReportWith(deps, 'token', {...args, room:'outside'})).ok).toBe(false);
 expect(rest).not.toHaveBeenCalled();
});

it('files conversation summaries in the Brain memory library', async () => {
 const {deps, rest} = fixture();
 expect((await writeRoomReportWith(deps, 'token', args, true)).ok).toBe(true);
 expect(rest.mock.calls[0]?.[3]).toMatchObject({source:'CanX Brain:Data conversation summary'});
});
