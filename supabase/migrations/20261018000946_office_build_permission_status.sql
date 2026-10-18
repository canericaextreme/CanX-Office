-- John requested equal Claude/ChatGPT build access, 17 October 2026.
-- The original read-only metadata response retained a constant false after
-- office-work-v1 was added. Report the existing checked grant; this does not
-- bypass the build bridge, owner/risk checks, budgets or builder selection.
create or replace function canx_private.mcp_office_status()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare uid uuid:=canx_private.mcp_owner(); projects jsonb; tasks jsonb;
begin
 if not canx_private.mcp_session_active() then raise exception 'Active owner grant required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into projects from (
   select id,left(title,160) as name,updated_at from public.office_notes
   where owner_id=uid and source='Lovable project import' order by updated_at desc,id limit 200
 ) r;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into tasks from (
   select id,case when status in ('open','in_progress','waiting','done','completed','cancelled') then status else 'unknown' end as status,
   case when project ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then project else null end as project,updated_at from public.manager_tasks
   where owner_id=uid order by updated_at desc,id limit 200
 ) r;
 return jsonb_build_object('checkedAt',now(),'source','Owner-scoped saved Office operational metadata',
   'projects',projects,'tasks',tasks,
   'truncated',exists(select 1 from public.manager_tasks where owner_id=uid offset 200)
     or exists(select 1 from public.office_notes where owner_id=uid and source='Lovable project import' offset 200),
   'missingReads',jsonb_build_array('Private records, full room contents and device-only data are excluded.'),
   'buildPermission',canx_private.mcp_work_active());
end $$;

