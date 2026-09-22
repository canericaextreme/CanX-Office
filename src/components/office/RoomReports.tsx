import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useRouterState } from '@tanstack/react-router';
import { useOwnerSession } from '@/lib/owner-session';
import { listSharedNotes } from '@/lib/records.functions';
import { roomByRoute } from '@/lib/office-data';
import type { OfficeNote } from '@/lib/office-notes';

export function RoomReports({ position }: { position: 'top' | 'bottom' }) {
  const path = useRouterState({ select: s => s.location.pathname });
  const room = roomByRoute(path);
  const { accessToken } = useOwnerSession();
  const list = useServerFn(listSharedNotes);
  const [notes, setNotes] = useState<OfficeNote[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!accessToken) return;
      try {
        const reply = await list({ data: { accessToken } });
        if (!active) return;
        setNotes(reply.ok ? reply.data ?? [] : []);
        setError(reply.ok ? '' : 'Room reports could not be loaded.');
      } catch { if (active) setError('Room reports could not be loaded.'); }
    };
    setNotes([]); void refresh();
    window.addEventListener('canx-room-reports-changed', refresh);
    return () => { active = false; window.removeEventListener('canx-room-reports-changed', refresh); };
  }, [accessToken, path, list]);
  const reports = notes.filter(n => n.source === `Data room report:${room?.id}:${position}`);
  if (!reports.length && !error) return null;
  return <section className="mx-auto w-full max-w-7xl space-y-4 p-6" aria-label="Room reports">
    {error && <p role="status">{error}</p>}
    {reports.map(n => <article key={n.id} className="rounded-xl border border-border bg-card p-5 text-lg">
      <h2 className="text-xl font-semibold">{n.title}</h2>
      <p className="mb-3 text-sm text-muted-foreground">Data-authored report · {n.id}</p>
      <p className="whitespace-pre-wrap">{n.detail}</p>
    </article>)}
  </section>;
}
