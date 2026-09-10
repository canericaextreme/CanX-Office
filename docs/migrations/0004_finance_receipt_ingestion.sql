-- CanX Office — Gmail receipt ingestion extension.
-- STATUS: NOT APPLIED. Apply only to the existing CanX-owned external database.
-- This is additive: the existing finance_receipts.doc and its 12 records are not rewritten.

alter table public.finance_receipts
  add column if not exists ingested_receipts jsonb not null default '[]'::jsonb,
  add column if not exists gmail_sync_checkpoint text,
  add column if not exists ingestion_updated_at timestamptz;

alter table public.finance_receipts
  add constraint finance_ingested_receipts_array
  check (jsonb_typeof(ingested_receipts) = 'array');

create or replace function public.ingest_finance_receipts(
  _owner_id uuid,
  _candidates jsonb,
  _checkpoint text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  _row public.finance_receipts%rowtype;
  _candidate jsonb;
  _stored jsonb;
  _filed jsonb := '[]'::jsonb;
  _duplicates integer := 0;
  _legacy jsonb := '[]'::jsonb;
begin
  if auth.uid() is distinct from _owner_id or not public.is_verified_owner() then
    raise exception 'forbidden';
  end if;
  if jsonb_typeof(_candidates) is distinct from 'array' or jsonb_array_length(_candidates) > 25 then
    raise exception 'invalid candidates';
  end if;

  insert into public.finance_receipts(owner_id) values (_owner_id)
  on conflict (owner_id) do nothing;
  select * into _row from public.finance_receipts where owner_id = _owner_id for update;
  _stored := coalesce(_row.ingested_receipts, '[]'::jsonb);
  _legacy := coalesce(_row.doc -> 'receipts', '[]'::jsonb);

  for _candidate in select value from jsonb_array_elements(_candidates)
  loop
    if coalesce(_candidate->>'vendor','') = ''
      or coalesce(_candidate->>'gmailMessageId','') = ''
      or coalesce(_candidate->>'attachmentIdentity','') = ''
      or coalesce(_candidate->>'contentFingerprint','') !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(_candidate->'total') not in ('number') then
      raise exception 'invalid candidate';
    end if;

    if exists (
      select 1 from jsonb_array_elements(_stored || _legacy) r
      where (
        r->>'gmailMessageId' = _candidate->>'gmailMessageId'
        and r->>'attachmentIdentity' = _candidate->>'attachmentIdentity'
      ) or (
        coalesce(_candidate->>'invoiceNumber','') <> ''
        and lower(coalesce(r->>'vendor','')) = lower(_candidate->>'vendor')
        and lower(coalesce(r->>'invoiceNumber', r->>'orderNumber','')) = lower(_candidate->>'invoiceNumber')
      ) or r->>'contentFingerprint' = _candidate->>'contentFingerprint'
      or (r->'sourceMessageIds') ? (_candidate->>'gmailMessageId')
    ) then
      _duplicates := _duplicates + 1;
    else
      _stored := _stored || jsonb_build_array(_candidate);
      _filed := _filed || jsonb_build_array(_candidate);
    end if;
  end loop;

  update public.finance_receipts
  set ingested_receipts = _stored,
      gmail_sync_checkpoint = left(coalesce(_checkpoint,''), 100),
      ingestion_updated_at = now(),
      updated_at = now()
  where owner_id = _owner_id;

  insert into public.office_audit(owner_id, action, entity, entity_id, detail)
  values (_owner_id, 'finance.receipts.ingest', 'finance_receipts', _owner_id::text,
    jsonb_build_object('filed', jsonb_array_length(_filed), 'duplicates_skipped', _duplicates));

  return jsonb_build_object('filed', _filed, 'duplicates_skipped', _duplicates);
end;
$$;

grant execute on function public.ingest_finance_receipts(uuid, jsonb, text) to authenticated;
revoke execute on function public.ingest_finance_receipts(uuid, jsonb, text) from anon;
grant execute on function public.ingest_finance_receipts(uuid, jsonb, text) to service_role;
