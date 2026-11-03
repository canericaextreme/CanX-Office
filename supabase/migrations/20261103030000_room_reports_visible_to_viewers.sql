-- 3 Nov 2026, John: "put yourself in work and fix these" (Work Board tasks c129c10d and bd320e5b).
-- Room reports are saved as office_notes with source 'Data room report: <room id>' (see
-- src/lib/manager-room-commands.ts roomReportSource). John's own room screens show them, but the
-- read-only viewer accounts (Claude, ChatGPT, Elsie) never did: canx_view_note_routes had no case
-- for them, so read_room_information('/systems') returned notes: [] even after a save.
-- This adds that one case. A report is only visible in its own room, and only when that room is
-- already in the viewer's grant (canx_view_allows is unchanged). No insert/update/delete is added.
create or replace function public.canx_view_note_routes(_source text) returns text[]
language sql immutable set search_path = public as $$
  select case
    when _source = 'Legal room: document filing' then array['/legal']
    when _source in ('Lovable project import','Project register: category','Project register: plan') then array['/projects']
    when _source like 'CanX Brain:%' or _source in ('Brain index: category','Brain shelf: filing') then array['/brain']
    when _source = 'Shared note' then public.canx_view_rooms()
    when _source like 'Data room report: %'
      and public.canx_view_room_route(substr(_source, 19)) = any(public.canx_view_rooms())
      then array[public.canx_view_room_route(substr(_source, 19))]
    else array[]::text[] end $$;
