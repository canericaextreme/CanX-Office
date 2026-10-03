create table public.office_files (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), filename text not null check(length(filename) between 1 and 300),
 room text not null, folder text not null, object_path text not null, content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 size_bytes bigint not null check(size_bytes between 1 and 26214400), mime_type text not null, created_at timestamptz not null default now(),
 unique(owner_id,content_hash,room,folder), check(object_path = owner_id::text || '/' || content_hash || '/original'),
 check(room in ('reception','owner-desk','brain','idea-garage','project-rooms','safe-highways','work-board','office-team','build-testing','finance','subscriptions','communications','legal','records','skills','systems','health','approvals','blueprint','future','family-continuity','analytics','round-table','research')),
 check(folder in ('Start Here','Family and Legacy','Journals and Talks','CanX Projects','Finance','Rules and Decisions'))
);
alter table public.office_files enable row level security;
grant select,insert,update on public.office_files to authenticated;
create policy office_files_owner_select on public.office_files for select to authenticated using(owner_id=(select auth.uid()) and public.has_role((select auth.uid()),'owner') and (room <> 'finance' or (select auth.jwt()->>'aal')='aal2'));
create policy office_files_owner_insert on public.office_files for insert to authenticated with check(owner_id=(select auth.uid()) and public.has_role((select auth.uid()),'owner') and (room <> 'finance' or (select auth.jwt()->>'aal')='aal2'));
create policy office_files_owner_update on public.office_files for update to authenticated using(owner_id=(select auth.uid()) and public.has_role((select auth.uid()),'owner') and (room <> 'finance' or (select auth.jwt()->>'aal')='aal2')) with check(owner_id=(select auth.uid()) and public.has_role((select auth.uid()),'owner') and (room <> 'finance' or (select auth.jwt()->>'aal')='aal2'));
insert into storage.buckets(id,name,public,file_size_limit) values('office-files','office-files',false,26214400);
create policy office_files_storage_insert on storage.objects for insert to authenticated with check(bucket_id='office-files' and (storage.foldername(name))[1]=(select auth.uid())::text and public.has_role((select auth.uid()),'owner'));
create policy office_files_storage_select on storage.objects for select to authenticated using(bucket_id='office-files' and (storage.foldername(name))[1]=(select auth.uid())::text and public.has_role((select auth.uid()),'owner'));

