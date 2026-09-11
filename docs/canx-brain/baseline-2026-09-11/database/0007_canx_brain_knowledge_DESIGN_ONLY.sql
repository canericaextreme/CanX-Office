-- =====================================================================
-- CanX Office — portable CanX Brain knowledge architecture
-- DESIGN ONLY. NOT APPLIED. NO DATA INCLUDED.
--
-- This is an additive proposal for the existing CanX-owned Supabase project.
-- It must be reviewed against the live schema and applied only after John's
-- exact approval. It creates no passwords, keys, owner grants, vault records,
-- legacy release rules, or knowledge content.
--
-- Expected dependency: public.is_verified_owner() from the reviewed CanX
-- Office core migration. If the live project differs, stop and reconcile it.
-- =====================================================================
--
-- CHANGE NOTE — revision 2 (design only, still not applied)
-- Why this revision is safer than revision 1:
--  * Every cross-table reference now carries owner_id and is enforced by a
--    composite foreign key, so a row can never point at another owner's
--    space, source, record, or import entity.
--  * Links and version rows additionally carry space_id and are enforced to
--    stay inside a single space, so a protected space cannot be joined to an
--    operational one by a stray insert.
--  * Ownership and space columns are not grantable to authenticated browser
--    users on UPDATE (column-level grants), so ownership cannot be moved after
--    creation even by a signed-in owner session.
--  * brain_record_versions keeps INSERT and SELECT only. There is no
--    authenticated UPDATE or DELETE grant and no such policy, so history is
--    append-only.
--  * current_version stays at 0 and is not browser-updatable. Promotion to an
--    approved version requires a later, separately reviewed security-definer
--    function (see section 8) rather than a client-side pointer write.
--  * brain_access_grants and legacy_release_policies have no authenticated
--    grant and no authenticated policy at all — service role only.
--  * No anon grant anywhere; no seeded rows; no DROP statements; the whole
--    script is one transaction and uses IF NOT EXISTS / guarded policy
--    creation so a re-run is a no-op.
--
-- =====================================================================
-- PREFLIGHT — run these read-only checks BEFORE any apply is considered.
-- They are commented out on purpose. Nothing here executes.
--
--   -- 1. Required dependency function must already exist:
--   -- select p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef
--   --   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   --  where n.nspname = 'public' and p.proname = 'is_verified_owner';
--
--   -- 2. gen_random_uuid() must be available (pgcrypto or pg >= 13 core):
--   -- select extname from pg_extension where extname = 'pgcrypto';
--   -- select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   --  where p.proname = 'gen_random_uuid';
--   -- If absent: create extension if not exists pgcrypto; (separate approval)
--
--   -- 3. Live table-name conflict check (must return zero rows):
--   -- select tablename from pg_tables where schemaname = 'public'
--   --   and tablename in ('brain_spaces','brain_sources','brain_records',
--   --     'brain_record_versions','brain_links','brain_import_batches',
--   --     'brain_retrieval_audit','brain_access_grants',
--   --     'legacy_release_policies');
--
--   -- 4. RLS and grant review after any future apply:
--   -- select relname, relrowsecurity from pg_class
--   --  where relnamespace = 'public'::regnamespace and relname like 'brain\_%';
--   -- select table_name, grantee, privilege_type, column_name
--   --   from information_schema.column_privileges
--   --  where table_schema = 'public' and table_name like 'brain\_%';
--   -- select grantee, table_name, privilege_type
--   --   from information_schema.role_table_grants
--   --  where table_schema = 'public' and grantee = 'anon';  -- must be empty
-- =====================================================================

begin;

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

commit;

-- =====================================================================
-- 8. DEFERRED, SEPARATELY REVIEWED STEP — controlled version promotion
--
-- current_version cannot be safely constrained in pure DDL: a plain foreign
-- key to (record_id, version) would be circular with the version rows it
-- points at, and it could not verify approval_status. This revision therefore
-- leaves current_version at 0, blocks it from browser UPDATE by column grant,
-- and defers promotion to a controlled security-definer function such as:
--
--   public.brain_promote_record_version(p_record_id uuid, p_version integer)
--
-- Required behaviour of that future function (design notes only, NOT created
-- here): verify the caller is the record owner and a verified owner; verify
-- the named version exists for that record, belongs to the same owner, and
-- has approval_status = 'approved'; mark the previously current version
-- 'superseded' by appending, never rewriting; set current_version atomically;
-- write a brain_retrieval_audit entry. It must be reviewed, tested, and
-- approved by John before it is written or applied.
--
-- REVIEW GATES BEFORE APPLICATION
-- 1. Run the preflight checks at the top of this file, read-only.
-- 2. Read-only comparison with the live CanX database and applied migrations.
-- 3. Security review of RLS, column grants, storage, and service-role operations.
-- 4. Confirm whether protected vaults require separate databases or encryption
--    keys rather than logical separation in one database.
-- 5. Define and test import validation, duplicate detection, conflict handling,
--    content hashing, and rollback.
-- 6. Obtain John's exact approval before apply or import.
-- =====================================================================
