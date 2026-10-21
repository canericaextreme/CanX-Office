-- Finance receipts: append-only save for connected assistants (requested by John, 21 Oct 2026).
--
-- The problem: an assistant could only add a receipt through write_office_record, which merges
-- whole Finance document keys. To add one receipt it had to resend the COMPLETE receipts list,
-- and every write is capped at 12,000 bytes. On 21 Oct the stored list reached 11,704 bytes
-- (14 receipts), so no further receipt fitted and twelve were left waiting.
--
-- The fix: a separate append-only function. The caller sends ONLY the new receipts. The database
-- adds them to the end of the stored list in one locked step, so:
--  * the 12,000-byte cap applies to the new receipts in one call, never to the stored list;
--  * existing receipts are never sent, rewritten, removed or reordered (checked below; any
--    difference aborts the whole call and nothing is saved);
--  * a receipt whose id is already saved is skipped, so a retry never makes a duplicate.
-- Same gate as write_office_record: a connected assistant with an active Office working grant,
-- John's own Finance row only, and the row must already exist. Every call is audited (ids only,
-- no amounts or vendors). Nothing else changes: write_office_record, subscriptions, the room's own
-- save, the two-step rule for the Finance room and every other Finance skill stay as they are.
-- This only saves receipts. It never reconciles, pays or deletes anything.

create or replace function canx_private.append_finance_receipts(_receipts jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare uid uuid:=canx_private.mcp_owner(); old_doc jsonb; old_list jsonb; incoming jsonb:='[]'::jsonb; skipped jsonb:='[]'::jsonb; new_list jsonb; item jsonb; seen text[]:='{}'; rid text; old_len integer; begin
 if not canx_private.mcp_work_active() then raise exception 'Office working grant required' using errcode='42501'; end if;
 if jsonb_typeof(_receipts) is distinct from 'array' or jsonb_array_length(_receipts)<1 or jsonb_array_length(_receipts)>25 or octet_length(_receipts::text)>12000 then raise exception 'Invalid receipts batch'; end if;
 for item in select value from jsonb_array_elements(_receipts) loop
  rid:=item->>'id';
  if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'id') is distinct from 'string' or length(rid)<1 or length(rid)>80
   or jsonb_typeof(item->'vendor') is distinct from 'string' or btrim(item->>'vendor')='' or rid=any(seen) then raise exception 'Invalid receipts batch'; end if;
  seen:=seen||rid;
 end loop;
 select doc into old_doc from public.finance_receipts where owner_id=uid for update;
 if old_doc is null then raise exception 'Initialize Finance inside the Office before editing'; end if;
 old_list:=coalesce(old_doc->'receipts','[]'::jsonb);
 if jsonb_typeof(old_list) is distinct from 'array' then raise exception 'Invalid receipts batch'; end if;
 old_len:=jsonb_array_length(old_list);
 for item in select value from jsonb_array_elements(_receipts) loop
  if exists(select 1 from jsonb_array_elements(old_list) e where e.value->>'id'=item->>'id') then skipped:=skipped||to_jsonb(item->>'id');
  else incoming:=incoming||jsonb_build_array(item); end if;
 end loop;
 if jsonb_array_length(incoming)>0 then
  update public.finance_receipts set doc=jsonb_set(doc,'{receipts}',old_list||incoming,true), updated_at=now() where owner_id=uid returning doc->'receipts' into new_list;
  -- Proof inside the same locked step: the old receipts are still first, unchanged and in order,
  -- and the new ones follow exactly as sent. Any difference rolls the whole call back.
  if jsonb_array_length(new_list)<>old_len+jsonb_array_length(incoming)
   or (select coalesce(jsonb_agg(e.value order by e.n),'[]'::jsonb) from jsonb_array_elements(new_list) with ordinality e(value,n) where e.n<=old_len)<>old_list
   or (select coalesce(jsonb_agg(e.value order by e.n),'[]'::jsonb) from jsonb_array_elements(new_list) with ordinality e(value,n) where e.n>old_len)<>incoming
  then raise exception 'Receipts append could not be verified; nothing was saved'; end if;
 else new_list:=old_list; end if;
 insert into public.office_audit(owner_id,action,entity,entity_id,detail) values(uid,'office_mcp.finance_append','finance_receipts',uid::text,
  jsonb_build_object('client_id',auth.jwt()->>'client_id','appended',(select coalesce(jsonb_agg(e->'id'),'[]'::jsonb) from jsonb_array_elements(incoming) e),'skipped',skipped,'before',old_len,'after',jsonb_array_length(new_list)));
 return jsonb_build_object('saved',true,'appended',incoming,'alreadySaved',skipped,'countBefore',old_len,'countAfter',jsonb_array_length(new_list));
end $$;
revoke all on function canx_private.append_finance_receipts(jsonb) from public,anon,authenticated;
grant execute on function canx_private.append_finance_receipts(jsonb) to authenticated;

create or replace function public.canx_append_finance_receipts(_receipts jsonb) returns jsonb language sql security invoker set search_path=''
as $$ select canx_private.append_finance_receipts(_receipts) $$;
revoke all on function public.canx_append_finance_receipts(jsonb) from public,anon;
grant execute on function public.canx_append_finance_receipts(jsonb) to authenticated;
