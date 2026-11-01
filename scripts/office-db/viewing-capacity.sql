-- Boundary check against the real function; rollback removes every test request/audit row.
begin;
do $$
declare g canx_private.office_view_grants%rowtype; recent integer; i integer;
begin
  select * into g from canx_private.office_view_grants
    where assistant='chatgpt' and enabled and revoked_at is null and expires_at>now()
      and '/reception'=any(rooms) and 'view_room_images'=any(scopes) limit 1;
  if not found then raise exception 'An active ChatGPT Reception grant is required for this rollback test'; end if;
  select count(*) into recent from canx_private.office_view_requests
    where owner_id=g.owner_id and assistant=g.assistant and requested_at>now()-interval '1 hour';
  if recent>=120 then raise exception 'Test requires fewer than120 existing requests'; end if;
  for i in recent+1..120 loop
    perform canx_private.view_request_make(g.owner_id,g.assistant,'/reception','desktop','default','image');
  end loop;
  begin
    perform canx_private.view_request_make(g.owner_id,g.assistant,'/reception','desktop','default','image');
    raise exception 'Request121 unexpectedly accepted';
  exception when sqlstate '53400' then null; end;
  begin
    perform canx_private.view_request_make(g.owner_id,g.assistant,'/not-a-room','desktop','default','image');
    raise exception 'Unknown route unexpectedly accepted';
  exception when sqlstate '22023' then null; end;
end $$;
rollback;
