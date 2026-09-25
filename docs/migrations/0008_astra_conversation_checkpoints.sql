-- =====================================================================
-- CanX Office — Astra cross-device conversation checkpoint.
--
-- STATUS: NOT APPLIED. Review, then apply only to the existing CanX-owned
-- database. Additive: creates one table and one function. It does not change
-- or delete any existing table or data.
--
-- Depends on: 0001 (is_verified_owner, office_audit).
-- =====================================================================

begin;

create table public.astra_conversation_checkpoints (
  id bigserial primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  turn_id uuid not null,
  mode text not null check (mode in ('text', 'voice')),
  user_text text not null check (char_length(user_text) between 1 and 4000),
  answer_text text not null check (char_length(answer_text) between 1 and 4000),
  client_seq integer not null check (client_seq > 0),
  client_at timestamptz not null,
  server_seq bigint not null,
  created_at timestamptz not null default now(),
  unique (owner_id, turn_id),
  unique (owner_id, server_seq)
);

-- Read-only for the owner; all writes go through the function below.
grant select on public.astra_conversation_checkpoints to authenticated;
grant all on public.astra_conversation_checkpoints to service_role;
revoke all on public.astra_conversation_checkpoints from anon;

alter table public.astra_conversation_checkpoints enable row level security;

create policy "Verified owner reads own Astra checkpoints"
  on public.astra_conversation_checkpoints for select to authenticated
  using (auth.uid() = owner_id and public.is_verified_owner());

create index astra_checkpoints_owner_seq_idx
  on public.astra_conversation_checkpoints (owner_id, server_seq desc);

-- Idempotent append. Same turn id twice = no second row. Serialized per owner
-- so server_seq is strictly increasing. Keeps the newest 200 turns. Audits
-- counts only (no conversation text in the audit row).
create or replace function public.append_astra_checkpoint(
  _turn_id uuid, _mode text, _user_text text, _answer_text text,
  _client_seq integer, _client_at timestamptz
) returns table (turn_id uuid, server_seq bigint, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing bigint;
  next_seq bigint;
  pruned integer := 0;
begin
  if uid is null or not public.is_verified_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('astra_checkpoint:' || uid::text));

  select c.server_seq into existing from public.astra_conversation_checkpoints c
   where c.owner_id = uid and c.turn_id = _turn_id;
  if found then
    return query select _turn_id, existing, false;
    return;
  end if;

  select coalesce(max(c.server_seq), 0) + 1 into next_seq
    from public.astra_conversation_checkpoints c where c.owner_id = uid;

  insert into public.astra_conversation_checkpoints
    (owner_id, turn_id, mode, user_text, answer_text, client_seq, client_at, server_seq)
  values (uid, _turn_id, _mode, left(_user_text, 4000), left(_answer_text, 4000), _client_seq, _client_at, next_seq);

  delete from public.astra_conversation_checkpoints c
   where c.owner_id = uid and c.server_seq <= next_seq - 200;
  get diagnostics pruned = row_count;

  insert into public.office_audit (owner_id, action, entity, entity_id, detail)
  values (uid, 'astra_checkpoint.append', 'astra_conversation_checkpoints', _turn_id::text,
          jsonb_build_object('server_seq', next_seq, 'mode', _mode, 'pruned', pruned));

  return query select _turn_id, next_seq, true;
end;
$$;

revoke all on function public.append_astra_checkpoint(uuid, text, text, text, integer, timestamptz) from public;
revoke all on function public.append_astra_checkpoint(uuid, text, text, text, integer, timestamptz) from anon;
grant execute on function public.append_astra_checkpoint(uuid, text, text, text, integer, timestamptz) to authenticated;

commit;
