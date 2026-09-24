-- Additive document archive. No conversation memory or existing source is replaced.
create table public.knowledge_documents (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 title text not null check (length(title) between 1 and 300),
 project text not null default '' check(length(project)<=160),
 filename text not null check(length(filename) between 1 and 300),
 content_hash text not null,
 character_count integer not null check(character_count between 1 and 2000000),
 chunk_count integer not null,
 created_at timestamptz not null default now(),
 unique(owner_id,project,filename,content_hash), unique(id,owner_id)
);
create table public.knowledge_document_sections (
 document_id uuid not null,
 owner_id uuid not null,
 section_number integer not null check(section_number>0),
 content text not null check(length(content) between 1 and 6000),
 search_vector tsvector generated always as (to_tsvector('english',content)) stored,
 primary key(document_id,section_number),
 foreign key(document_id,owner_id) references public.knowledge_documents(id,owner_id)
);
create index knowledge_section_search on public.knowledge_document_sections using gin(search_vector);
create index knowledge_documents_owner on public.knowledge_documents(owner_id,created_at desc);
create index knowledge_sections_owner on public.knowledge_document_sections(owner_id,document_id);
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_document_sections enable row level security;
create policy documents_read on public.knowledge_documents for select to authenticated using(owner_id=(select auth.uid()) and public.has_role((select auth.uid()),'owner'));
create policy sections_read on public.knowledge_document_sections for select to authenticated using(owner_id=(select auth.uid()) and public.has_role((select auth.uid()),'owner'));
create policy documents_insert on public.knowledge_documents for insert to authenticated with check(owner_id=(select auth.uid()) and public.has_role((select auth.uid()),'owner') and (select auth.jwt()->>'aal')='aal2');
create policy sections_insert on public.knowledge_document_sections for insert to authenticated with check(owner_id=(select auth.uid()) and public.has_role((select auth.uid()),'owner') and (select auth.jwt()->>'aal')='aal2');
revoke all on public.knowledge_documents,public.knowledge_document_sections from anon,authenticated;
grant select,insert on public.knowledge_documents,public.knowledge_document_sections to authenticated;

create function public.import_knowledge_document(p_title text,p_project text,p_filename text,p_text text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare d public.knowledge_documents; n integer; reconstructed text;
begin
 if auth.uid() is null or not public.has_role(auth.uid(),'owner') or auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Owner verification required'; end if;
 if length(p_text) not between 1 and 2000000 or length(p_title) not between 1 and 300 or length(p_filename) not between 1 and 300 or length(p_project)>160 then raise exception 'Invalid document size or metadata'; end if;
 -- Lock only this owner's import key; retrying an interrupted import cannot duplicate it.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_project||p_filename||md5(p_text),0));
 select * into d from public.knowledge_documents where owner_id=auth.uid() and project=p_project and filename=p_filename and content_hash=md5(p_text);
 if not found then
  n:=ceil(length(p_text)::numeric/6000)::integer;
  insert into public.knowledge_documents(owner_id,title,project,filename,content_hash,character_count,chunk_count)
  values(auth.uid(),p_title,p_project,p_filename,md5(p_text),length(p_text),n) returning * into d;
  insert into public.knowledge_document_sections(document_id,owner_id,section_number,content)
  select d.id,auth.uid(),i,substring(p_text from (i-1)*6000+1 for 6000) from generate_series(1,n) i;
 end if;
 select string_agg(content,'' order by section_number) into reconstructed from public.knowledge_document_sections where document_id=d.id and owner_id=auth.uid();
 if reconstructed is distinct from p_text then raise exception 'Document readback failed'; end if;
 return to_jsonb(d)||jsonb_build_object('verified',true);
end $$;
revoke all on function public.import_knowledge_document(text,text,text,text) from public,anon;
grant execute on function public.import_knowledge_document(text,text,text,text) to authenticated;

create function public.search_knowledge_sections(p_query text,p_document_id uuid default null,p_start integer default null)
returns table(document_id uuid,title text,filename text,content_hash text,chunk_count integer,section_number integer,content text)
language sql security invoker set search_path=public as $$
 select d.id,d.title,d.filename,d.content_hash,d.chunk_count,s.section_number,s.content
 from public.knowledge_documents d join public.knowledge_document_sections s on s.document_id=d.id and s.owner_id=d.owner_id
 where d.owner_id=auth.uid() and (p_document_id is null or d.id=p_document_id)
 and (case when p_start is not null then s.section_number>=greatest(1,p_start)
 else s.search_vector @@ websearch_to_tsquery('english',left(p_query,1000)) end)
 order by case when p_start is null then ts_rank(s.search_vector,websearch_to_tsquery('english',left(p_query,1000))) else 0 end desc,s.section_number
 limit 8;
$$;
revoke all on function public.search_knowledge_sections(text,uuid,integer) from public,anon;
grant execute on function public.search_knowledge_sections(text,uuid,integer) to authenticated;
