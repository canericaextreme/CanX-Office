-- =====================================================================
-- CanX Office — APPLY: CanX Brain operational schema + approved baseline
-- File: docs/canx-brain/baseline-2026-09-11/database/
--       APPLY_CANX_BRAIN_OPERATIONAL_2026-09-11.sql
--
-- PRIVATE, REVIEWABLE. Prepared for ONE run by John in the SQL Editor of the
-- existing CanX-owned external Supabase project. Not applied by the agent.
--
-- What this does:
--  1. Preflight, inside the transaction: requires public.is_verified_owner()
--     and gen_random_uuid(); refuses to continue if an existing Brain table
--     has an incompatible shape.
--  2. Creates the hardened Brain schema from
--     0007_canx_brain_knowledge_DESIGN_ONLY.sql (revision 2), verbatim and
--     idempotent.
--  3. Resolves owner_id from the single existing owner row in
--     public.user_roles. No email or UUID is hard-coded. Zero or multiple
--     owners aborts the run.
--  4. Creates ONLY the operational space (state active, protected true) and
--     imports exactly 16 approved operational records from
--     records/canx-brain.json, idempotently by stable_key + content SHA-256.
--  5. Records one import batch with accepted / duplicate / rejected /
--     conflict counts, the package id and the package SHA-256.
--
-- What this deliberately does NOT do:
--  * No rows for business_protected, personal, or legacy. Those spaces stay
--    absent, so brain_access_grants and legacy_release_policies stay empty.
--  * No DROP, DELETE, TRUNCATE, or overwrite of any existing row.
--  * No secrets, no auth changes, no role changes, no grants to anon, no
--    email or payment changes, no unrelated tables.
--  * No general browser promotion function. current_version is set only
--    inside this privileged transaction, and only after the target version
--    is confirmed to exist and be approved.
--
-- Rerun safety: the whole script is one transaction and rolls back on any
-- error. A second run inserts no new records and no new versions; it reports
-- them as duplicates in a new import batch row.
--
-- Package id     : CANX-BRAIN-BASELINE-2026-09-11
-- Package SHA-256: 99735c13b8f72af27bfe4e9461d46ae9fd8676171894227d51865d52934f3ba9
--   (sha256 of records/canx-brain.json, bytes as shipped)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. PREFLIGHT — executed, not commented. Any failure aborts the run.
-- ---------------------------------------------------------------------
do $preflight$
declare
  v_owner_count integer;
  v_missing text;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'is_verified_owner'
  ) then
    raise exception 'PREFLIGHT FAILED: public.is_verified_owner() is missing. Apply the CanX Office core migration first.';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.proname = 'gen_random_uuid' and n.nspname in ('public','pg_catalog','extensions')
  ) then
    raise exception 'PREFLIGHT FAILED: gen_random_uuid() is unavailable. Enable pgcrypto under separate approval, then re-run.';
  end if;

  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'user_roles') then
    raise exception 'PREFLIGHT FAILED: public.user_roles is missing, so the owner cannot be resolved.';
  end if;

  select count(*) into v_owner_count from public.user_roles where role = 'owner';
  if v_owner_count = 0 then
    raise exception 'PREFLIGHT FAILED: no owner row exists in public.user_roles.';
  elsif v_owner_count > 1 then
    raise exception 'PREFLIGHT FAILED: % owner rows exist in public.user_roles. Exactly one is required.', v_owner_count;
  end if;

  -- Shape check: if a Brain table already exists it must carry the columns
  -- this script relies on. A partial or foreign table of the same name aborts.
  select string_agg(t.expected, ', ') into v_missing
    from (values
      ('brain_spaces',           'owner_id,space_key,label,protected,state'),
      ('brain_sources',          'owner_id,source_key,source_type,title,verification_status,metadata'),
      ('brain_records',          'owner_id,space_id,stable_key,category,record_type,current_version,lifecycle_status,confidence,sensitivity,project_keys,tags'),
      ('brain_record_versions',  'owner_id,record_id,version,title,summary,body,source_keys,content_sha256,author_kind,approval_status,approved_by,approved_at'),
      ('brain_import_batches',   'owner_id,target_space_id,package_id,package_sha256,status,accepted_count,rejected_count,conflict_count,report,completed_at')
    ) as t(tbl, cols)
    cross join lateral (
      select t.tbl || '.' || c as expected
        from unnest(string_to_array(t.cols, ',')) as c
       where exists (select 1 from pg_tables where schemaname = 'public' and tablename = t.tbl)
         and not exists (
           select 1 from information_schema.columns
            where table_schema = 'public' and table_name = t.tbl and column_name = c
         )
    ) as t2;

  if v_missing is not null then
    raise exception 'PREFLIGHT FAILED: existing Brain table(s) have an incompatible shape. Missing columns: %', v_missing;
  end if;

  raise notice 'PREFLIGHT PASSED: dependencies present, exactly one owner, no incompatible Brain table.';
end
$preflight$;

-- ---------------------------------------------------------------------
-- 1. SCHEMA — verbatim from 0007_canx_brain_knowledge_DESIGN_ONLY.sql
--    (revision 2 body, between its begin; and commit;). Idempotent.
-- ---------------------------------------------------------------------

-- Schema usage only. No anon.
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- ---------------------------------------------------------------------
-- 1. Spaces. Operational, Business Protected, Personal, and Legacy are
-- separate security boundaries. No rows are seeded by this migration.
-- ---------------------------------------------------------------------

create table if not exists public.brain_spaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  space_key text not null check (space_key in ('operational', 'business_protected', 'personal', 'legacy')),
  label text not null check (char_length(label) between 1 and 120),
  protected boolean not null default true,
  state text not null default 'disabled' check (state in ('disabled', 'designed', 'active', 'sealed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, space_key)
);

-- Composite target so children can prove they share the space's owner.
create unique index if not exists brain_spaces_id_owner_key
  on public.brain_spaces (id, owner_id);

-- ---------------------------------------------------------------------
-- 2. Sources. A source describes where a fact came from. Source content
-- remains in its proper record or file system; secrets never go here.
-- ---------------------------------------------------------------------

create table if not exists public.brain_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null check (char_length(source_key) between 1 and 160),
  source_type text not null check (source_type in ('owner_instruction', 'conversation', 'document', 'project', 'database', 'email', 'external_reference')),
  title text not null check (char_length(title) between 1 and 500),
  external_ref text not null default '' check (char_length(external_ref) <= 1000),
  source_date date,
  retrieved_at timestamptz,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'retrieved', 'verified', 'stale', 'conflicting')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (owner_id, source_key)
);

create unique index if not exists brain_sources_id_owner_key
  on public.brain_sources (id, owner_id);

-- ---------------------------------------------------------------------
-- 3. Stable records and append-only versions.
-- current_version intentionally stays 0 until a reviewed controlled
-- promotion function exists (section 8).
-- ---------------------------------------------------------------------

create table if not exists public.brain_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null,
  stable_key text not null check (char_length(stable_key) between 1 and 180),
  category text not null check (category in ('profile', 'master_plan', 'project', 'decision', 'status', 'goal', 'rule', 'relationship', 'conflict')),
  record_type text not null check (char_length(record_type) between 1 and 80),
  current_version integer not null default 0 check (current_version >= 0),
  lifecycle_status text not null default 'planned' check (lifecycle_status in ('current', 'proposed', 'planned', 'active', 'blocked', 'needs_review', 'conflicting', 'superseded', 'archived', 'unknown')),
  confidence text not null default 'unknown' check (confidence in ('verified', 'high', 'medium', 'low', 'unknown')),
  sensitivity text not null default 'restricted' check (sensitivity in ('internal', 'restricted', 'highly_restricted')),
  project_keys text[] not null default '{}',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, stable_key),
  constraint brain_records_space_owner_fk
    foreign key (space_id, owner_id)
    references public.brain_spaces (id, owner_id) on delete restrict
);

-- Composite targets for children: same owner AND same space.
create unique index if not exists brain_records_id_owner_key
  on public.brain_records (id, owner_id);
create unique index if not exists brain_records_id_owner_space_key
  on public.brain_records (id, owner_id, space_id);

create table if not exists public.brain_record_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  record_id uuid not null,
  version integer not null check (version > 0),
  title text not null check (char_length(title) between 1 and 300),
  summary text not null check (char_length(summary) between 1 and 10000),
  body jsonb not null default '{}'::jsonb,
  source_keys text[] not null default '{}',
  effective_date date,
  recorded_date date,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  author_kind text not null check (author_kind in ('owner', 'human', 'chatgpt', 'claude', 'office_manager', 'import')),
  author_label text not null default '' check (char_length(author_label) <= 160),
  approval_status text not null default 'proposed' check (approval_status in ('proposed', 'approved', 'rejected', 'superseded')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (record_id, version),
  constraint brain_record_versions_record_owner_fk
    foreign key (record_id, owner_id)
    references public.brain_records (id, owner_id) on delete restrict
);

-- Composite target used by the future promotion function to verify that a
-- current_version pointer names a real, approved version of the same record.
create unique index if not exists brain_record_versions_record_version_owner_key
  on public.brain_record_versions (record_id, version, owner_id);

-- No browser UPDATE or DELETE grant or policy exists for versions. Corrections
-- are new versions, preserving what every model saw and why it changed.

-- ---------------------------------------------------------------------
-- 4. Relationships and conflicts. Both endpoints must share the owner and
-- the space named on the link row.
-- ---------------------------------------------------------------------

create table if not exists public.brain_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null,
  source_record_id uuid not null,
  target_record_id uuid not null,
  relationship text not null check (relationship in ('relates_to', 'depends_on', 'supersedes', 'conflicts_with', 'implements', 'evidences', 'governs')),
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  unique (source_record_id, target_record_id, relationship),
  check (source_record_id <> target_record_id),
  constraint brain_links_space_owner_fk
    foreign key (space_id, owner_id)
    references public.brain_spaces (id, owner_id) on delete restrict,
  constraint brain_links_source_same_owner_space_fk
    foreign key (source_record_id, owner_id, space_id)
    references public.brain_records (id, owner_id, space_id) on delete restrict,
  constraint brain_links_target_same_owner_space_fk
    foreign key (target_record_id, owner_id, space_id)
    references public.brain_records (id, owner_id, space_id) on delete restrict
);

-- ---------------------------------------------------------------------
-- 5. Imports and retrieval audit. Imports are staged and reported before
-- activation. Retrieval logs record versions used, not prompt secrets.
-- ---------------------------------------------------------------------

create table if not exists public.brain_import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  target_space_id uuid not null,
  package_id text not null check (char_length(package_id) between 1 and 180),
  package_sha256 text check (package_sha256 is null or package_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'staged' check (status in ('staged', 'validated', 'approved', 'imported', 'rejected', 'failed')),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint brain_import_batches_space_owner_fk
    foreign key (target_space_id, owner_id)
    references public.brain_spaces (id, owner_id) on delete restrict
);

create unique index if not exists brain_import_batches_id_owner_key
  on public.brain_import_batches (id, owner_id);

create table if not exists public.brain_retrieval_audit (
  id bigserial primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null,
  actor_kind text not null check (actor_kind in ('owner', 'human', 'chatgpt', 'claude', 'office_manager', 'system')),
  actor_label text not null default '' check (char_length(actor_label) <= 160),
  purpose text not null check (char_length(purpose) between 1 and 500),
  record_versions jsonb not null default '[]'::jsonb,
  decision text not null default '' check (char_length(decision) <= 1000),
  at timestamptz not null default now(),
  constraint brain_retrieval_audit_space_owner_fk
    foreign key (space_id, owner_id)
    references public.brain_spaces (id, owner_id) on delete restrict
);

-- ---------------------------------------------------------------------
-- 6. Protected grants and legacy release design. These tables remain empty
-- and service-role-only. No authenticated grant and no authenticated policy
-- is created for them, so no browser session and no model can read, grant
-- itself access, or activate a legacy release.
-- ---------------------------------------------------------------------

create table if not exists public.brain_access_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null,
  grantee_kind text not null check (grantee_kind in ('user', 'role', 'service')),
  grantee_ref text not null check (char_length(grantee_ref) between 1 and 300),
  permission text not null check (permission in ('read', 'propose', 'export', 'administer')),
  purpose text not null check (char_length(purpose) between 1 and 500),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint brain_access_grants_space_owner_fk
    foreign key (space_id, owner_id)
    references public.brain_spaces (id, owner_id) on delete cascade
);

create table if not exists public.legacy_release_policies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  legacy_space_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'legal_review', 'approved', 'revoked')),
  policy jsonb not null default '{}'::jsonb,
  legal_reviewed_at timestamptz,
  owner_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legacy_release_policies_space_owner_fk
    foreign key (legacy_space_id, owner_id)
    references public.brain_spaces (id, owner_id) on delete restrict
);

-- ---------------------------------------------------------------------
-- 7. Grants and RLS. No anon access anywhere. Column-level UPDATE grants
-- keep ownership and space assignment immutable from the browser.
-- ---------------------------------------------------------------------

revoke all on public.brain_spaces, public.brain_sources, public.brain_records,
  public.brain_record_versions, public.brain_links,
  public.brain_import_batches, public.brain_retrieval_audit,
  public.brain_access_grants, public.legacy_release_policies from public;
revoke all on public.brain_spaces, public.brain_sources, public.brain_records,
  public.brain_record_versions, public.brain_links,
  public.brain_import_batches, public.brain_retrieval_audit,
  public.brain_access_grants, public.legacy_release_policies from anon;
revoke all on public.brain_spaces, public.brain_sources, public.brain_records,
  public.brain_record_versions, public.brain_links,
  public.brain_import_batches, public.brain_retrieval_audit,
  public.brain_access_grants, public.legacy_release_policies from authenticated;

-- Spaces: no UPDATE on id / owner_id / space_key.
grant select, insert on public.brain_spaces to authenticated;
grant update (label, protected, state, updated_at) on public.brain_spaces to authenticated;

-- Sources: append-only from the browser.
grant select, insert on public.brain_sources to authenticated;

-- Records: no UPDATE on id / owner_id / space_id / stable_key /
-- current_version. The pointer is promoted only by the reviewed function in
-- section 8, never by a client write.
grant select, insert on public.brain_records to authenticated;
grant update (category, record_type, lifecycle_status, confidence, sensitivity,
  project_keys, tags, updated_at) on public.brain_records to authenticated;

-- Versions: append-only. Deliberately no UPDATE and no DELETE.
grant select, insert on public.brain_record_versions to authenticated;

-- Links: append-only.
grant select, insert on public.brain_links to authenticated;

-- Import batches: no UPDATE on id / owner_id / target_space_id / package_id.
grant select, insert on public.brain_import_batches to authenticated;
grant update (package_sha256, status, accepted_count, rejected_count,
  conflict_count, report, completed_at) on public.brain_import_batches to authenticated;

-- Retrieval audit: append-only.
grant select, insert on public.brain_retrieval_audit to authenticated;

-- Protected grants and legacy policies: service-role managed only, after
-- exact approval. No authenticated grant of any kind.

grant all on public.brain_spaces, public.brain_sources, public.brain_records,
  public.brain_record_versions, public.brain_links,
  public.brain_import_batches, public.brain_retrieval_audit,
  public.brain_access_grants, public.legacy_release_policies to service_role;
grant usage, select on sequence public.brain_retrieval_audit_id_seq to authenticated;
grant all on sequence public.brain_retrieval_audit_id_seq to service_role;

alter table public.brain_spaces enable row level security;
alter table public.brain_sources enable row level security;
alter table public.brain_records enable row level security;
alter table public.brain_record_versions enable row level security;
alter table public.brain_links enable row level security;
alter table public.brain_import_batches enable row level security;
alter table public.brain_retrieval_audit enable row level security;
alter table public.brain_access_grants enable row level security;
alter table public.legacy_release_policies enable row level security;

-- Belt and braces: forbid a future superuser mistake from exempting these.
alter table public.brain_access_grants force row level security;
alter table public.legacy_release_policies force row level security;

-- Idempotent policy creation. No DROP of unrelated objects.
do $policies$
begin

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'brain_spaces' and policyname = 'Verified owner reads own brain spaces') then
    create policy "Verified owner reads own brain spaces"
      on public.brain_spaces for select to authenticated
      using (owner_id = auth.uid() and public.is_verified_owner());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'brain_spaces' and policyname = 'Verified owner creates own brain spaces') then
    create policy "Verified owner creates own brain spaces"
      on public.brain_spaces for insert to authenticated
      with check (owner_id = auth.uid() and public.is_verified_owner());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'brain_spaces' and policyname = 'Verified owner updates own brain spaces') then
    create policy "Verified owner updates own brain spaces"
      on public.brain_spaces for update to authenticated
      using (owner_id = auth.uid() and public.is_verified_owner())
      with check (owner_id = auth.uid() and public.is_verified_owner());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'brain_sources' and policyname = 'Verified owner reads own brain sources') then
    create policy "Verified owner reads own brain sources"
      on public.brain_sources for select to authenticated
      using (owner_id = auth.uid() and public.is_verified_owner());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'brain_sources' and policyname = 'Verified owner appends own brain sources') then
    create policy "Verified owner appends own brain sources"
      on public.brain_sources for insert to authenticated
      with check (owner_id = auth.uid() and public.is_verified_owner());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'brain_records' and policyname = 'Verified owner reads own brain records') then
    create policy "Verified owner reads own brain records"
      on public.brain_records for select to authenticated
      using (owner_id = auth.uid() and public.is_verified_owner());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'brain_records' and policyname = 'Verified owner creates own brain records') then
    create policy "Verified owner creates own brain records"
      on public.brain_records for insert to authenticated
      with check (owner_id = auth.uid() and public.is_verified_owner()
        and current_version = 0);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'brain_records' and policyname = 'Verified owner updates own brain record fields') then
    create policy "Verified owner updates own brain record fields"
      on public.brain_records for update to authenticated
      using (owner_id = auth.uid() and public.is_verified_owner())
      with check (owner_id = auth.uid() and public.is_verified_owner());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'brain_record_versions' and policyname = 'Verified owner reads own brain versions') then
    create policy "Verified owner reads own brain versions"
      on public.brain_record_versions for select to authenticated
      using (owner_id = auth.uid() and public.is_verified_owner());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'brain_record_versions' and policyname = 'Verified owner appends own brain versions') then
    create policy "Verified owner appends own brain versions"
      on public.brain_record_versions for insert to authenticated
      with check (owner_id = auth.uid() and public.is_verified_owner()
        and approval_status = 'proposed'
        and approved_by is null
        and approved_at is null);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'brain_links' and policyname = 'Verified owner reads own brain links') then
    create policy "Verified owner reads own brain links"
      on public.brain_links for select to authenticated
      using (owner_id = auth.uid() and public.is_verified_owner());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'brain_links' and policyname = 'Verified owner appends own brain links') then
    create policy "Verified owner appends own brain links"
      on public.brain_links for insert to authenticated
      with check (owner_id = auth.uid() and public.is_verified_owner());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'brain_import_batches' and policyname = 'Verified owner reads own import batches') then
    create policy "Verified owner reads own import batches"
      on public.brain_import_batches for select to authenticated
      using (owner_id = auth.uid() and public.is_verified_owner());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'brain_import_batches' and policyname = 'Verified owner creates own import batches') then
    create policy "Verified owner creates own import batches"
      on public.brain_import_batches for insert to authenticated
      with check (owner_id = auth.uid() and public.is_verified_owner()
        and status = 'staged');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'brain_import_batches' and policyname = 'Verified owner updates own import batches') then
    create policy "Verified owner updates own import batches"
      on public.brain_import_batches for update to authenticated
      using (owner_id = auth.uid() and public.is_verified_owner())
      with check (owner_id = auth.uid() and public.is_verified_owner());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'brain_retrieval_audit' and policyname = 'Verified owner reads own retrieval audit') then
    create policy "Verified owner reads own retrieval audit"
      on public.brain_retrieval_audit for select to authenticated
      using (owner_id = auth.uid() and public.is_verified_owner());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'brain_retrieval_audit' and policyname = 'Verified owner appends own retrieval audit') then
    create policy "Verified owner appends own retrieval audit"
      on public.brain_retrieval_audit for insert to authenticated
      with check (owner_id = auth.uid() and public.is_verified_owner());
  end if;

  -- Deliberately no policy for public.brain_access_grants.
  -- Deliberately no policy for public.legacy_release_policies.

end
$policies$;

create index if not exists brain_records_owner_space_category_idx
  on public.brain_records (owner_id, space_id, category, updated_at desc);
create index if not exists brain_record_versions_record_version_idx
  on public.brain_record_versions (record_id, version desc);
create index if not exists brain_sources_owner_key_idx
  on public.brain_sources (owner_id, source_key);
create index if not exists brain_retrieval_audit_owner_at_idx
  on public.brain_retrieval_audit (owner_id, at desc);
create index if not exists brain_links_owner_space_idx
  on public.brain_links (owner_id, space_id);
create index if not exists brain_import_batches_owner_space_idx
  on public.brain_import_batches (owner_id, target_space_id);

-- ---------------------------------------------------------------------
-- 2. IMPORT PAYLOAD — staged in a transaction-scoped temporary table.
--    Content hashes are precomputed over a canonical JSON projection of
--    {stable_key, title, summary, body, sorted source_keys, effective_date,
--    recorded_date} from records/canx-brain.json.
-- ---------------------------------------------------------------------

create temporary table _canx_brain_payload (
  stable_key      text primary key,
  category        text not null,
  record_type     text not null,
  title           text not null,
  summary         text not null,
  body            jsonb not null,
  lifecycle_status text not null,
  confidence      text not null,
  sensitivity     text not null,
  project_keys    text[] not null,
  tags            text[] not null,
  source_keys     text[] not null,
  effective_date  date,
  recorded_date   date,
  content_sha256  text not null
) on commit drop;

create temporary table _canx_brain_sources (
  source_key          text primary key,
  source_type         text not null,
  title               text not null,
  source_date         date,
  verification_status text not null,
  limitation          text not null
) on commit drop;

insert into _canx_brain_sources (source_key, source_type, title, source_date, verification_status, limitation) values
  ('SRC-CHAT-CONTEXT', 'conversation', 'Relevant prior ChatGPT work and remembered decisions', null::date, 'retrieved', 'Relevant retrieval, not a complete byte-for-byte account export'),
  ('SRC-CURRENT-REQUEST', 'owner_instruction', 'John''s current knowledge-transfer instruction', '2026-09-11'::date, 'verified', 'Current instruction only'),
  ('SRC-LOV-OFFICE', 'project', 'CanX Office project records through commit 48e61507dd20552203262849679e7d6b4b8416c6', '2026-09-11'::date, 'retrieved', 'Production database rows were not queried'),
  ('SRC-LOV-SH', 'project', 'Safe Highways project messages and audits', '2026-09-08'::date, 'retrieved', 'No new production or phone test was run during this transfer'),
  ('SRC-LOV-TRAIL', 'project', 'Trail Tales project messages and audits', '2026-08-31'::date, 'stale', 'Exact current trip dates remain unresolved'),
  ('SRC-OFFICE-MASTER', 'document', 'CanX_Office_Master_Prompt_v1.2.md (v1.2)', '2026-09-09'::date, 'retrieved', 'Planning document; not proof of implementation'),
  ('SRC-OFFICE-SETUP', 'document', 'CanX-Office-Setup.sql.txt', '2026-09-09'::date, 'stale', 'Historical setup script; current applied state not directly re-verified'),
  ('SRC-SH-ARCH', 'document', 'Safe_Highways_Canada_Master_Architecture_v2.0.docx (v2.0)', '2026-08-01'::date, 'retrieved', 'Architecture; not current production proof'),
  ('SRC-SH-IP', 'document', 'Canerica_Extreme_CanX_Safe_Highways_Canada_Founder_Ownership_and_IP_Control_v1.0.docx (v1.0)', '2026-08-22'::date, 'retrieved', 'Not a substitute for legal advice or an executed succession agreement'),
  ('SRC-TRAIL-MASTER', 'document', 'Trail_Tales_Master_Plan_and_Lovable_Build_Prompt.docx', '2026-08-27'::date, 'conflicting', 'Contains January 2027 trip timing that may be superseded');

insert into _canx_brain_payload (stable_key, category, record_type, title, summary, body,
  lifecycle_status, confidence, sensitivity, project_keys, tags, source_keys,
  effective_date, recorded_date, content_sha256) values
  ('CANX-PROFILE-OWNER-001', 'profile', 'owner_profile', 'John Cantlon — CanX owner and final authority', 'John Cantlon founded and controls Canerica Extreme, branded CanX, and retains final authority over CanX decisions, approvals, ownership, and consequential actions.', '{"brand":"CanX","business_name":"Canerica Extreme","decision_role":"Final GO, HOLD, NO-GO, approval, and ownership authority","domain_background":"Long-term highway-maintenance professional and foreman with practical operations, labour, and bargaining experience.","preferred_public_line":"A CanX Initiative"}'::jsonb, 'current', 'high', 'internal', array['canx-office']::text[], array['owner', 'authority', 'canx']::text[], array['SRC-CHAT-CONTEXT', 'SRC-OFFICE-MASTER', 'SRC-SH-IP']::text[], null::date, '2026-09-11'::date, 'b7886a1fe83818059192e0256a14a5e24c3e9280eb9baf593913b8e0eb001440'),
  ('CANX-PROFILE-WORKSTYLE-001', 'profile', 'working_preferences', 'John''s working and communication preferences', 'Use plain English, offer a recommended solution, provide visible progress, check direct access before asking John to relay information, and make the Office as hands-free as practical without auto-executing misunderstood speech.', '{"communication":["plain English","clear grammar","suggested solution","step-by-step when action is needed"],"execution":["check available connections first","minimize prompt carrying","show whether work is active or waiting"],"voice":["two-way Manager conversation","speech shown for review before send","no autoplay unless deliberately enabled"]}'::jsonb, 'current', 'high', 'internal', array['canx-office']::text[], array['communication', 'manager', 'voice']::text[], array['SRC-CHAT-CONTEXT', 'SRC-LOV-OFFICE']::text[], null::date, '2026-09-11'::date, '548cc3b9e93673c1b59121d7f51147eb51156caac0362577f043c09d5232ce79'),
  ('CANX-PLAN-OFFICE-001', 'master_plan', 'office_mission', 'CanX Office mission', 'CanX Office is John''s visual command centre for projects, ideas, AI-assisted work, finances, records, and decisions. It must show what is happening, what needs John, what is blocked, what is verified, and what it will cost.', '{"knowledge_goal":"A durable CanX Brain that prevents lost handoffs and repeated explanations","operating_path":"John asks \u2192 Manager plans \u2192 specialist works \u2192 second eyes \u2192 safety/authority gate \u2192 John approves when required","ownership_goal":"CanX-controlled accounts, files, code, data, domains, exports, and recovery paths","portability_goal":"Rebuildable outside Lovable and readable by multiple AI providers"}'::jsonb, 'current', 'verified', 'internal', array['canx-office']::text[], array['office', 'brain', 'portability', 'ownership']::text[], array['SRC-LOV-OFFICE', 'SRC-OFFICE-MASTER']::text[], null::date, '2026-09-11'::date, '8a9ae4d33dc32f988d01e61b6307d262ecf7744849b23c9d5af8075643666060'),
  ('CANX-GOAL-INCOME-001', 'goal', 'financial_goal', 'CanX monthly income goal', 'Reach CAD $10,000 per month by approximately August 2028. The measurement definition is still open.', '{"currency":"CAD","definition_options":["gross revenue","net business income","personal take-home"],"definition_status":"needs owner decision","period":"month","target_amount":10000,"target_date":"2028-08"}'::jsonb, 'needs_review', 'high', 'internal', array['canx-office']::text[], array['income', 'goal', '2028']::text[], array['SRC-CHAT-CONTEXT', 'SRC-OFFICE-MASTER']::text[], null::date, '2026-09-11'::date, 'aa489e9d9aced2434563e6da2d36e5580ec2905d25f309b85f23f04d6f411cb7'),
  ('CANX-GOAL-COST-001', 'goal', 'cost_guardrail', 'CanX Office monthly running-cost ceiling', 'The approved total Office running-cost ceiling is CAD $500 per month if required. It is a ceiling, not a spending target or a separate allowance for each provider.', '{"amount":500,"build_credits_separate":true,"currency":"CAD","period":"month","scope":"total CanX Office running costs"}'::jsonb, 'current', 'verified', 'internal', array['canx-office']::text[], array['budget', 'cost-control']::text[], array['SRC-CHAT-CONTEXT', 'SRC-LOV-OFFICE']::text[], '2026-09-09'::date, '2026-09-11'::date, '991be2c286836ffa5eb49e14a1824f0778b3fe76a109c746e26c3cd2664fd170'),
  ('CANX-STATUS-OFFICE-001', 'status', 'project_status', 'CanX Office current status', 'Active and published with 20 destinations, Manager voice work, approvals, work board, Brain, Finance controls, and an external CanX database configuration. The portable knowledge schema is not yet applied to the live database.', '{"approved_recovery_commit":"ac0246cba03eb68271eb4656a3329c8401a6d797","current_lovable_commit":"48e61507dd20552203262849679e7d6b4b8416c6","database":"external CanX-owned Supabase configuration; Lovable-managed database disabled","deployment_changed_by_this_transfer":false,"knowledge_gap":"durable knowledge is mostly hard-coded and the Brain still includes sample projects/workers"}'::jsonb, 'active', 'verified', 'restricted', array['canx-office']::text[], array['status', 'recovery', 'database', 'knowledge-gap']::text[], array['SRC-LOV-OFFICE', 'SRC-OFFICE-SETUP']::text[], '2026-09-11'::date, '2026-09-11'::date, 'defe7e18173e6135c903023459039a12765dc66f48303f9120585b385dd11613'),
  ('CANX-STATUS-FINANCE-001', 'status', 'finance_status', 'CanX Office receipt review status', 'Twelve private receipts are recorded. They remain unreviewed and unreconciled in the latest evidence.', '{"receipt_count":12,"reconciliation":"not completed","tax_treatment":"not determined","totals":[{"amount":30.23,"currency":"CAD","receipt_count":1},{"amount":719.2,"currency":"USD","receipt_count":10},{"amount":5.6,"currency":"unknown","receipt_count":1}]}'::jsonb, 'needs_review', 'high', 'restricted', array['canx-office']::text[], array['finance', 'receipts', 'tax-preparation']::text[], array['SRC-CHAT-CONTEXT', 'SRC-LOV-OFFICE']::text[], '2026-09-10'::date, '2026-09-11'::date, '7a3bd5e38f9e72cef3b0917d2387d8216bddfad0da6c5ba58953e51f9894a284'),
  ('CANX-PLAN-SAFE-HIGHWAYS-001', 'master_plan', 'programme_architecture', 'Safe Highways Canada master direction', 'One national, portable, configuration-driven highway-safety and operational-support platform. Alberta is the first implementation, Saskatchewan follows, and BC is deferred while the employment conflict remains relevant.', '{"ai_boundary":"advisory; qualified road authorities retain authority","brand_line":"Safe Highways Canada \u2014 A CanX Initiative","commercial_boundary":"organizational workflows, analytics, exports, oversight, GIS/API, and services\u2014not a fee to report","core_flow":"SEE \u2192 REPORT \u2192 ASSESS \u2192 ROUTE \u2192 RESPOND \u2192 RECORD \u2192 ANALYZE \u2192 IMPROVE","public_reporting":"free, simple, mobile-friendly, accessible, and trackable","tone":"objective, constructive, and non-shaming"}'::jsonb, 'current', 'verified', 'internal', array['safe-highways-canada', 'safe-highway-ops-dash', 'safe-roads-canada']::text[], array['safe-highways', 'national-core', 'alberta', 'public-reporting']::text[], array['SRC-CHAT-CONTEXT', 'SRC-SH-ARCH', 'SRC-SH-IP']::text[], null::date, '2026-09-11'::date, '4da9d4c605a45d4446d5d58a2b2f154dad3d32422bc0f674a76d595c8c01c170'),
  ('CANX-DECISION-ROUTING-001', 'decision', 'technical_direction', 'Safe Highways jurisdiction routing', 'Use authoritative maintenance-area or contract-area boundaries and point-in-polygon routing. Document source, accuracy, gaps, overlaps, edge cases, effective dates, and correction history.', '{"current_priority":"authoritative Alberta CMA geometry and repeatable provincial methodology","fallback_rule":"uncertain or boundary-edge results go to human review","municipal_rule":"municipal/private/non-covered roads must not be silently assigned to a highway contractor","preferred_method":"PostGIS point-in-polygon"}'::jsonb, 'current', 'high', 'internal', array['safe-highways-canada', 'safe-highway-ops-dash']::text[], array['gis', 'routing', 'postgis', 'cma']::text[], array['SRC-CHAT-CONTEXT', 'SRC-LOV-SH', 'SRC-SH-ARCH']::text[], null::date, '2026-09-11'::date, 'deec094d22d30d8de6448332b60f54516a689444e3946559e4cd9006b6e07275'),
  ('CANX-STATUS-SAFE-HIGHWAYS-001', 'status', 'programme_status', 'Safe Highways implementation status', 'Public reporting, Foreman Hub, and national website projects are published. Routing phases 1–7 and hardening were reported complete in prior work, but production readiness remains dependent on verified boundaries, real-world offline tests, demo-data separation, and live operational participation.', '{"data_status_as_of_2026_09_07":"eight seeded demonstration hazard reports; no confirmed genuine public reports","foreman_backend":"verified in Lovable as shared with the public reporting app","next_candidate_phase":"municipal positive elimination near city interfaces","production_readiness":"not fully verified","reported_milestones":["resolver and routing tables","confidence bands","500-case validation baseline","Alberta v2 promotion gate","13 PR tests","offline queue improvements"]}'::jsonb, 'needs_review', 'medium', 'restricted', array['safe-highways-canada', 'safe-highway-ops-dash', 'safe-roads-canada']::text[], array['status', 'beta', 'offline', 'demo-data']::text[], array['SRC-CHAT-CONTEXT', 'SRC-LOV-SH', 'SRC-SH-ARCH']::text[], '2026-09-08'::date, '2026-09-11'::date, '87e2a283ce876ee21f172726ec2b34b1cbbb527e76769dcdaf62c5b08aeb9010'),
  ('CANX-PLAN-TRAIL-TALES-001', 'master_plan', 'product_architecture', 'Trail Tales master direction', 'Trail Tales is a private, mobile-first, offline-first travel companion for planning, capture, group use, route and media history, and later story/journal exports. It remains separate from Safe Highways.', '{"architecture":"separate Supabase, authentication, storage, data, and branding from Safe Highways","capture":["photos","notes","voice","short video where reliable","GPS trails","plans","messages"],"offline":"local-first save before network; cold launch after preparation; lossless idempotent reconnect","privacy":"private by default; sharing is narrow and deliberate","release_one_tracking":"foreground only; never claim tracking while suspended"}'::jsonb, 'current', 'verified', 'internal', array['trail-story-keeper']::text[], array['trail-tales', 'offline-first', 'privacy', 'travel']::text[], array['SRC-LOV-TRAIL', 'SRC-TRAIL-MASTER']::text[], null::date, '2026-09-11'::date, '32f3690c62691fac0276f5db065cba56c606e8901feb987fae4d18e87932af7a'),
  ('CANX-CONFLICT-TRAIL-DATES-001', 'conflict', 'schedule_conflict', 'Trail Tales first-trip timing conflict', 'The master plan says Vietnam with John and his two sons in January 2027. Later conversation memory says the trip moved to December 2 through Christmas, but the year and authoritative replacement dates were not recovered.', '{"required_resolution":"John confirms the current dates and whether Vietnam remains the first trip","source_a":"Vietnam, January 2027, exact dates TBD","source_b":"December 2 through Christmas, year not recovered"}'::jsonb, 'conflicting', 'high', 'internal', array['trail-story-keeper']::text[], array['trail-tales', 'dates', 'conflict']::text[], array['SRC-CHAT-CONTEXT', 'SRC-TRAIL-MASTER']::text[], null::date, '2026-09-11'::date, '54a6fd58313312a5a73bebf33315f1341bbb8a1709bc64d80bfaa13be5bc0f9a'),
  ('CANX-PLAN-IDEA-GARAGE-001', 'master_plan', 'idea_governance', 'Idea Garage and revenue-opportunity governance', 'Ideas move from Bike Rack through evidence and the Decision Room. Every idea needs a revenue hypothesis. Research never authorizes a build, and John makes the final GO/HOLD/NO-GO decision.', '{"current_real_idea":"Contract and RFP Scanner / CanX Opportunity Scout; feasibility only; $0 build authorization","deletion_rule":"archive, do not delete","scoring":"Opportunity Score and separate Confidence Score","thresholds":"70\u2013100 active; 55\u201369 holding; below 55 off active rack; below 45 archive/reject unless protected","tracks":["Fast Revenue","Validation","Feasibility","Reject/Park"]}'::jsonb, 'current', 'verified', 'internal', array['canx-office']::text[], array['ideas', 'revenue', 'governance', 'rfp']::text[], array['SRC-CHAT-CONTEXT', 'SRC-LOV-OFFICE']::text[], '2026-09-09'::date, '2026-09-11'::date, 'b86afdec9a898fbef76a1b96a54ac2f5a440e196a697094a0be5d1e367903d0a'),
  ('CANX-DECISION-BRAIN-MOTION-001', 'decision', 'truthful_status_rule', 'Brain movement must represent real work', 'Only verified, fresh, running work may animate in the CanX Brain. Idle, queued, disconnected, completed, failed, cancelled, stale, and sample records stay still.', '{"decorative_motion":"not allowed to imitate work","reduced_motion":"static equivalent required","tour_motion":"allowed only when clearly labelled"}'::jsonb, 'current', 'verified', 'internal', array['canx-office']::text[], array['brain', 'truth', 'status']::text[], array['SRC-LOV-OFFICE', 'SRC-OFFICE-MASTER']::text[], '2026-09-09'::date, '2026-09-11'::date, 'cc8c7165eaba83b1b2a43e6018da98115c95429c174aa366cd724501d233ce8b'),
  ('CANX-DECISION-PORTABILITY-001', 'decision', 'ownership_rule', 'Knowledge belongs to CanX, not a model', 'Canonical knowledge must be stored in CanX-controlled, exportable formats. ChatGPT, Claude, the Office Manager, and future models consume the same versioned records through adapters.', '{"canonical_formats":["PostgreSQL","JSON","JSONL","Markdown"],"model_role":"reader, drafter, analyst, or approved writer\u2014not canonical owner","required_export":"records, sources, versions, links, audit metadata, and hashes without secrets"}'::jsonb, 'current', 'verified', 'internal', array['canx-office']::text[], array['portability', 'ownership', 'models']::text[], array['SRC-CURRENT-REQUEST', 'SRC-OFFICE-MASTER', 'SRC-SH-IP']::text[], '2026-09-11'::date, '2026-09-11'::date, 'fc3d5760935ca206d60954c30fd1dc3e4154c5a40e90d1f0fbd320f036047e2e'),
  ('CANX-DECISION-PROTECTED-VAULTS-001', 'decision', 'privacy_boundary', 'Protected Business, Personal, and Legacy vaults remain empty', 'Design the protected vaults now, but do not populate or connect them. Personal investments, journals, estate material, and credentials require later exact approvals and stronger access controls.', '{"automatic_ingestion":false,"business_protected":"empty","credentials_allowed":false,"legacy":"empty","personal":"empty"}'::jsonb, 'current', 'verified', 'restricted', array['canx-office']::text[], array['privacy', 'legacy', 'personal', 'business-protected']::text[], array['SRC-CHAT-CONTEXT', 'SRC-CURRENT-REQUEST']::text[], '2026-09-11'::date, '2026-09-11'::date, 'cf587784630785d695759d1a44e506dc32652d4febe1fa2e14cc8a78002637eb');

-- ---------------------------------------------------------------------
-- 3. IMPORT — operational space only, idempotent, append-only versions.
-- ---------------------------------------------------------------------
do $import$
declare
  v_owner      uuid;
  v_space      uuid;
  v_record     uuid;
  v_accepted   integer := 0;
  v_duplicate  integer := 0;
  v_rejected   integer := 0;
  v_conflict   integer := 0;
  v_promoted   integer := 0;
  v_next_ver   integer;
  v_conflicts  text[] := '{}';
  p            record;
begin
  select ur.user_id into strict v_owner from public.user_roles ur where ur.role = 'owner';

  -- Operational space only. business_protected, personal and legacy are
  -- deliberately never created, so they cannot hold a single row.
  insert into public.brain_spaces (owner_id, space_key, label, protected, state)
  values (v_owner, 'operational', 'Operational', true, 'active')
  on conflict (owner_id, space_key) do update
    set label = excluded.label, protected = true, state = 'active', updated_at = now()
  returning id into v_space;

  -- Sources referenced by the imported records. Append-only, no overwrite.
  insert into public.brain_sources (owner_id, source_key, source_type, title,
    external_ref, source_date, retrieved_at, verification_status, metadata)
  select v_owner, s.source_key, s.source_type, s.title, '', s.source_date, now(),
         s.verification_status, jsonb_build_object('limitation', s.limitation,
           'register', 'docs/canx-brain/baseline-2026-09-11/sources/SOURCE_REGISTER.md')
    from _canx_brain_sources s
  on conflict (owner_id, source_key) do nothing;

  for p in select * from _canx_brain_payload order by stable_key loop
    select r.id into v_record
      from public.brain_records r
     where r.owner_id = v_owner and r.stable_key = p.stable_key;

    if v_record is null then
      insert into public.brain_records (owner_id, space_id, stable_key, category,
        record_type, current_version, lifecycle_status, confidence, sensitivity,
        project_keys, tags)
      values (v_owner, v_space, p.stable_key, p.category, p.record_type, 0,
        p.lifecycle_status, p.confidence, p.sensitivity, p.project_keys, p.tags)
      returning id into v_record;

      insert into public.brain_record_versions (owner_id, record_id, version, title,
        summary, body, source_keys, effective_date, recorded_date, content_sha256,
        author_kind, author_label, approval_status, approved_by, approved_at)
      values (v_owner, v_record, 1, p.title, p.summary, p.body, p.source_keys,
        p.effective_date, p.recorded_date, p.content_sha256, 'import',
        'CANX-BRAIN-BASELINE-2026-09-11', 'approved', v_owner, now());

      v_accepted := v_accepted + 1;

    elsif exists (
      select 1 from public.brain_record_versions v
       where v.record_id = v_record and v.owner_id = v_owner
         and v.content_sha256 = p.content_sha256
    ) then
      -- Same stable key, identical content hash: already imported.
      v_duplicate := v_duplicate + 1;

    else
      -- Same stable key, different content. This baseline import never
      -- overwrites or supersedes existing history; it reports the conflict
      -- and leaves the stored record untouched for John's decision.
      v_conflict := v_conflict + 1;
      v_conflicts := v_conflicts || p.stable_key;
    end if;

    v_record := null;
  end loop;

  -- Lifecycle status, including 'conflicting' and 'needs_review', is stored
  -- exactly as shipped. Nothing normalises or upgrades it.

  -- current_version is promoted only here, inside this privileged
  -- transaction, and only to a version that is proven to exist, belong to
  -- the same owner and record, and carry approval_status = 'approved'.
  with approved as (
    select v.record_id, max(v.version) as version
      from public.brain_record_versions v
      join public.brain_records r on r.id = v.record_id and r.owner_id = v.owner_id
     where v.owner_id = v_owner
       and r.space_id = v_space
       and v.approval_status = 'approved'
     group by v.record_id
  )
  update public.brain_records r
     set current_version = a.version, updated_at = now()
    from approved a
   where r.id = a.record_id
     and r.owner_id = v_owner
     and r.current_version is distinct from a.version;
  get diagnostics v_promoted = row_count;

  -- Import batch record with the full result. Reruns add a new batch row
  -- reporting duplicates; they never add records or versions.
  insert into public.brain_import_batches (owner_id, target_space_id, package_id,
    package_sha256, status, accepted_count, rejected_count, conflict_count,
    report, completed_at)
  values (v_owner, v_space, 'CANX-BRAIN-BASELINE-2026-09-11', '99735c13b8f72af27bfe4e9461d46ae9fd8676171894227d51865d52934f3ba9', 'imported',
    v_accepted, v_rejected, v_conflict,
    jsonb_build_object(
      'source_file', 'docs/canx-brain/baseline-2026-09-11/records/canx-brain.json',
      'records_in_package', 16,
      'accepted', v_accepted,
      'duplicate', v_duplicate,
      'rejected', v_rejected,
      'conflict', v_conflict,
      'conflicting_stable_keys', to_jsonb(v_conflicts),
      'versions_promoted', v_promoted,
      'target_space', 'operational',
      'protected_spaces_created', 0,
      'secrets_imported', false,
      'authorised_by', 'John Cantlon — explicit approval 2026-09-11'
    ), now());

  raise notice 'CanX Brain import: accepted=%, duplicate=%, rejected=%, conflict=%, promoted=%',
    v_accepted, v_duplicate, v_rejected, v_conflict, v_promoted;

  if v_conflict > 0 then
    raise notice 'Conflicting stable keys were NOT overwritten: %', v_conflicts;
  end if;

  if (select count(*) from public.brain_records where owner_id = v_owner and space_id = v_space) <> 16 then
    raise exception 'IMPORT ABORTED: operational record count is not 16 after import.';
  end if;

  if exists (select 1 from public.brain_spaces where space_key <> 'operational') then
    raise exception 'IMPORT ABORTED: a non-operational space exists. Protected spaces must stay empty.';
  end if;

  if exists (select 1 from public.brain_records where current_version = 0) then
    raise exception 'IMPORT ABORTED: a record has no promoted approved version.';
  end if;
end
$import$;

commit;

-- =====================================================================
-- 4. VERIFICATION — read-only. Run after the transaction commits.
-- =====================================================================

-- 4.1 Operational record count (expected: 16)
select 'operational_record_count' as check_name, count(*) as value
  from public.brain_records r
  join public.brain_spaces s on s.id = r.space_id
 where s.space_key = 'operational';

-- 4.2 Counts by lifecycle status (expected: current 11, needs_review 3,
--     active 1, conflicting 1)
select r.lifecycle_status, count(*) as records
  from public.brain_records r
  join public.brain_spaces s on s.id = r.space_id
 where s.space_key = 'operational'
 group by r.lifecycle_status
 order by r.lifecycle_status;

-- 4.3 Import result counts, most recent batch first
select b.package_id, b.package_sha256, b.status, b.accepted_count,
       b.rejected_count, b.conflict_count,
       b.report ->> 'duplicate' as duplicate_count,
       b.report ->> 'versions_promoted' as versions_promoted,
       b.completed_at
  from public.brain_import_batches b
 order by b.created_at desc;

-- 4.4 Protected spaces and protected records (all expected: 0)
select 'protected_spaces' as check_name,
       (select count(*) from public.brain_spaces
         where space_key in ('business_protected','personal','legacy')) as value
union all
select 'protected_records',
       (select count(*) from public.brain_records r
          join public.brain_spaces s on s.id = r.space_id
         where s.space_key <> 'operational')
union all
select 'brain_access_grants', (select count(*) from public.brain_access_grants)
union all
select 'legacy_release_policies', (select count(*) from public.legacy_release_policies);

-- 4.5 Anon grants on Brain tables (expected: zero rows)
select grantee, table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee in ('anon','PUBLIC')
   and (table_name like 'brain\_%' or table_name = 'legacy_release_policies')
 order by table_name, privilege_type;

-- 4.6 RLS enabled on every Brain table (expected: all true)
select relname as table_name, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
  from pg_class
 where relnamespace = 'public'::regnamespace
   and (relname like 'brain\_%' or relname = 'legacy_release_policies')
   and relkind = 'r'
 order by relname;

-- 4.7 Sample recall rows — authority, income goal, cost ceiling, round
--     table, Safe Highways rollout, Trail Tales conflict, protected areas.
--     NOTE: the approved package contains no round-table record. The round
--     table row is expected to be ABSENT, and the Office Manager must answer
--     'not recorded in the Brain' rather than inventing a time.
select r.stable_key, r.lifecycle_status, r.confidence, v.title,
       left(v.summary, 400) as summary_extract, v.source_keys
  from public.brain_records r
  join public.brain_record_versions v
    on v.record_id = r.id and v.version = r.current_version and v.owner_id = r.owner_id
  join public.brain_spaces s on s.id = r.space_id
 where s.space_key = 'operational'
   and r.stable_key in (
     'CANX-PROFILE-OWNER-001',
     'CANX-GOAL-INCOME-001',
     'CANX-GOAL-COST-001',
     'CANX-PLAN-SAFE-HIGHWAYS-001',
     'CANX-DECISION-ROUTING-001',
     'CANX-CONFLICT-TRAIL-DATES-001',
     'CANX-DECISION-PROTECTED-VAULTS-001'
   )
 order by r.stable_key;

-- 4.8 Round-table recall probe (expected: zero rows — nothing recorded)
select r.stable_key, v.title
  from public.brain_records r
  join public.brain_record_versions v
    on v.record_id = r.id and v.version = r.current_version and v.owner_id = r.owner_id
 where v.title ilike '%round table%' or v.summary ilike '%round table%';

-- 4.9 Every record points at an existing, approved version (expected: 16)
select count(*) as records_with_approved_current_version
  from public.brain_records r
  join public.brain_record_versions v
    on v.record_id = r.id and v.version = r.current_version
   and v.owner_id = r.owner_id and v.approval_status = 'approved';
-- =====================================================================
-- END. Nothing above was executed by the agent. Review, then run once.
-- =====================================================================
