create table public.office_links (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), title text not null check(length(title) between 1 and 300),
 url text not null check(length(url)<=2000 and url ~ '^https?://'), room text not null, folder text not null, created_at timestamptz not null default now(), unique(owner_id,url,room,folder)
);
alter table public.office_links enable row level security;
grant select,insert,update on public.office_links to authenticated;
create policy office_links_select on public.office_links for select to authenticated using(owner_id=(select auth.uid()) and public.has_role((select auth.uid()),'owner') and (room <> 'finance' or (select auth.jwt()->>'aal')='aal2'));
create policy office_links_insert on public.office_links for insert to authenticated with check(owner_id=(select auth.uid()) and public.has_role((select auth.uid()),'owner') and (room <> 'finance' or (select auth.jwt()->>'aal')='aal2'));
create policy office_links_update on public.office_links for update to authenticated using(owner_id=(select auth.uid()) and public.has_role((select auth.uid()),'owner') and (room <> 'finance' or (select auth.jwt()->>'aal')='aal2')) with check(owner_id=(select auth.uid()) and public.has_role((select auth.uid()),'owner') and (room <> 'finance' or (select auth.jwt()->>'aal')='aal2'));

