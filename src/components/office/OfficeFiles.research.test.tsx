// @vitest-environment happy-dom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const fixture = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  reads: [] as { table: string; room: string | undefined; order: string; ascending: boolean; limit: number }[],
}));
vi.mock('@tanstack/react-start', () => ({
  useServerFn: (fn: unknown) => fn,
}));
vi.mock('@/lib/owner-session', () => ({ useOwnerSession: () => ({ accessToken: 'fixture', ownerId: 'owner', aal: 'aal2', signedIn: true }) }));
vi.mock('@/lib/office-files.functions', () => ({
  listOfficeFiles: async ({ data }: { data: { room?: string } }) => {
    const { createClient } = await import('@supabase/supabase-js');
    const { readOfficeFileList } = await import('@/lib/office-files-list.server');
    return readOfficeFileList(createClient('https://example.invalid', 'fixture'), data.room);
  },
  prepareOfficeUpload: vi.fn(), finishOfficeUpload: vi.fn(), openOfficeFile: vi.fn(),
  officeUploadConnection: vi.fn(), saveOfficeLink: vi.fn(), deleteOfficeFile: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  from: (table: string) => {
    const request = { table, room: undefined as string | undefined, order: '', ascending: true, limit: Infinity };
    const query = {
      select: () => query,
      order: (column: string, options: { ascending: boolean }) => { request.order = column; request.ascending = options.ascending; return query; },
      limit: (n: number) => { request.limit = n; return query; },
      eq: (column: string, value: string) => { expect(column).toBe('room'); request.room = value; return query; },
      then: (resolve: (value: unknown) => unknown) => {
        fixture.reads.push({ ...request });
        const rows = (fixture.tables[table] ?? []).filter(row => !request.room || row['room'] === request.room)
          .slice().sort((a, b) => (Date.parse(String(a[request.order])) - Date.parse(String(b[request.order]))) * (request.ascending ? 1 : -1))
          .slice(0, request.limit);
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return query;
  },
}) }));
import { OfficeFiles } from './OfficeFiles';
import { listOfficeFiles } from '@/lib/office-files.functions';

afterEach(() => { cleanup(); fixture.tables = {}; fixture.reads = []; });
const link = (title: string, at: string, room = 'research') => ({ id: title, title, url: `https://example.invalid/${title}`, room, folder: 'CanX Projects', created_at: at });
const newest = [link('AutoCrit', '2026-10-27T12:00:00Z'), link('Fictionary', '2026-10-26T12:00:00Z'), link('BetaReader', '2026-10-25T12:00:00Z')];
const older = link('Older October 22 reference', '2026-10-22T12:00:00Z');

it('fetches Research links newest first and renders all three even with 200 newer uploaded files', async () => {
  fixture.tables['office_files'] = Array.from({ length: 200 }, (_, i) => ({ id: `file-${i}`, filename: `Upload ${i}.pdf`, room: 'research', folder: 'CanX Projects', created_at: '2026-10-28T00:00:00Z', size_bytes: 1, mime_type: 'application/pdf' }));
  fixture.tables['office_links'] = [older, newest[2]!, link('Other room', '2026-10-29T00:00:00Z', 'legal'), newest[0]!, newest[1]!];
  const original = JSON.stringify(fixture.tables);
  render(<OfficeFiles room="research" />);
  const saved = screen.getByRole('region', { name: 'Saved files' });
  await within(saved).findByText('AutoCrit');
  const anchors = within(saved).getAllByRole('link', { name: 'Open link' });
  expect(anchors.map(a => a.getAttribute('href'))).toEqual([...newest, older].map(row => row.url));
  // Ordinary navigation works in phone/PWA containers that suppress new tabs.
  expect(anchors.every(a => !a.hasAttribute('target'))).toBe(true);
  expect(within(saved).getByText('Upload 199.pdf')).toBeTruthy();
  expect(within(saved).queryByText('Other room')).toBeNull();
  expect(fixture.reads).toEqual(['office_files', 'office_links'].map(table => ({ table, room: 'research', order: 'created_at', ascending: false, limit: 200 })));
  expect(JSON.stringify(fixture.tables)).toBe(original);
});

it('refreshes links added outside this mounted room without changing existing records', async () => {
  fixture.tables['office_links'] = [older];
  render(<OfficeFiles room="research" />);
  await screen.findByText(older.title);
  fixture.tables['office_links'].push(...newest);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh saved files and links' }));
  await screen.findByText('AutoCrit');
  expect(screen.getByText('Fictionary')).toBeTruthy();
  expect(screen.getByText('BetaReader')).toBeTruthy();
  expect(screen.getByText(older.title)).toBeTruthy();
  await waitFor(() => expect(fixture.reads).toHaveLength(4));
});

it('preserves the existing combined limit in other rooms', async () => {
  fixture.tables['office_links'] = Array.from({ length: 201 }, (_, i) => link(`Link ${i}`, '2026-10-27T00:00:00Z', 'legal'));
  const rows = await listOfficeFiles({ data: { accessToken: 'fixture', room: 'legal' } });
  expect(rows).toHaveLength(200);
});
