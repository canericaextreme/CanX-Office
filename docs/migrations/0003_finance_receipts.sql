-- =====================================================================
-- CanX Office — private finance receipts.
--
-- STATUS: NOT APPLIED. No CanX-owned Supabase project has been identified
-- yet. This file is reference SQL only. It contains NO financial data and
-- NO email content, and it must never be used to seed records.
--
-- Apply order: 0001_canx_office_core.sql, 0002_ai_limits.sql, then this file.
-- =====================================================================

create table public.finance_receipts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  -- The whole private receipt set, as validated JSON. Private to the owner.
  doc jsonb not null default '{"schemaVersion":1,"kind":"canx-finance-receipts","receipts":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The Data API grants. No anon grant: these records are never public.
grant select, insert, update, delete on public.finance_receipts to authenticated;
grant all on public.finance_receipts to service_role;

alter table public.finance_receipts enable row level security;

-- Owner only, and only with two-step verification on the session.
create policy "Owner reads own receipts"
  on public.finance_receipts for select
  to authenticated
  using (
    auth.uid() = owner_id
    and public.has_role(auth.uid(), 'owner')
    and (auth.jwt() ->> 'aal') = 'aal2'
  );

create policy "Owner inserts own receipts"
  on public.finance_receipts for insert
  to authenticated
  with check (
    auth.uid() = owner_id
    and public.has_role(auth.uid(), 'owner')
    and (auth.jwt() ->> 'aal') = 'aal2'
  );

create policy "Owner updates own receipts"
  on public.finance_receipts for update
  to authenticated
  using (
    auth.uid() = owner_id
    and public.has_role(auth.uid(), 'owner')
    and (auth.jwt() ->> 'aal') = 'aal2'
  )
  with check (
    auth.uid() = owner_id
    and public.has_role(auth.uid(), 'owner')
    and (auth.jwt() ->> 'aal') = 'aal2'
  );

create policy "Owner deletes own receipts"
  on public.finance_receipts for delete
  to authenticated
  using (
    auth.uid() = owner_id
    and public.has_role(auth.uid(), 'owner')
    and (auth.jwt() ->> 'aal') = 'aal2'
  );

-- Every save is recorded in the append-only audit table from 0001. The audit
-- entry holds counts only: never a vendor, an amount, or email text.
