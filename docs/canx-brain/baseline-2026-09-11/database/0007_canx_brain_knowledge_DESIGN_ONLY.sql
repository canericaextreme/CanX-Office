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

begin;

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

-- ---------------------------------------------------------------------
-- 3. Stable records and append-only versions.
-- ---------------------------------------------------------------------

create table if not exists public.brain_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null references public.brain_spaces(id) on delete restrict,
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
  unique (owner_id, stable_key)
);

create table if not exists public.brain_record_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  record_id uuid not null references public.brain_records(id) on delete restrict,
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
  unique (record_id, version)
);

-- No browser UPDATE or DELETE policy will exist for versions. Corrections are
-- new versions, preserving what every model saw and why it changed.

-- ---------------------------------------------------------------------
-- 4. Relationships and conflicts.
-- ---------------------------------------------------------------------

create table if not exists public.brain_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null references public.brain_spaces(id) on delete restrict,
  source_record_id uuid not null references public.brain_records(id) on delete restrict,
  target_record_id uuid not null references public.brain_records(id) on delete restrict,
  relationship text not null check (relationship in ('relates_to', 'depends_on', 'supersedes', 'conflicts_with', 'implements', 'evidences', 'governs')),
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  unique (source_record_id, target_record_id, relationship)
);

-- ---------------------------------------------------------------------
-- 5. Imports and retrieval audit. Imports are staged and reported before
-- activation. Retrieval logs record versions used, not prompt secrets.
-- ---------------------------------------------------------------------

create table if not exists public.brain_import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  target_space_id uuid not null references public.brain_spaces(id) on delete restrict,
  package_id text not null check (char_length(package_id) between 1 and 180),
  package_sha256 text check (package_sha256 is null or package_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'staged' check (status in ('staged', 'validated', 'approved', 'imported', 'rejected', 'failed')),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.brain_retrieval_audit (
  id bigserial primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null references public.brain_spaces(id) on delete restrict,
  actor_kind text not null check (actor_kind in ('owner', 'human', 'chatgpt', 'claude', 'office_manager', 'system')),
  actor_label text not null default '' check (char_length(actor_label) <= 160),
  purpose text not null check (char_length(purpose) between 1 and 500),
  record_versions jsonb not null default '[]'::jsonb,
  decision text not null default '' check (char_length(decision) <= 1000),
  at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Protected grants and legacy release design. These tables remain empty.
-- No app policy permits a model to grant itself access or activate a release.
-- ---------------------------------------------------------------------

create table if not exists public.brain_access_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null references public.brain_spaces(id) on delete cascade,
  grantee_kind text not null check (grantee_kind in ('user', 'role', 'service')),
  grantee_ref text not null check (char_length(grantee_ref) between 1 and 300),
  permission text not null check (permission in ('read', 'propose', 'export', 'administer')),
  purpose text not null check (char_length(purpose) between 1 and 500),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.legacy_release_policies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  legacy_space_id uuid not null references public.brain_spaces(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'legal_review', 'approved', 'revoked')),
  policy jsonb not null default '{}'::jsonb,
  legal_reviewed_at timestamptz,
  owner_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. Grants and RLS. No anon access anywhere.
-- ---------------------------------------------------------------------

revoke all on public.brain_spaces, public.brain_sources, public.brain_records,
  public.brain_record_versions, public.brain_links,
  public.brain_import_batches, public.brain_retrieval_audit,
  public.brain_access_grants, public.legacy_release_policies from public;
revoke all on public.brain_spaces, public.brain_sources, public.brain_records,
  public.brain_record_versions, public.brain_links,
  public.brain_import_batches, public.brain_retrieval_audit,
  public.brain_access_grants, public.legacy_release_policies from anon;

grant select, insert, update on public.brain_spaces to authenticated;
grant select, insert on public.brain_sources to authenticated;
grant select, insert, update on public.brain_records to authenticated;
grant select, insert on public.brain_record_versions to authenticated;
grant select, insert on public.brain_links to authenticated;
grant select, insert, update on public.brain_import_batches to authenticated;
grant select, insert on public.brain_retrieval_audit to authenticated;
-- Protected grants and legacy policies are service-role managed after exact
-- approval. They have no authenticated browser grants by default.

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

create policy "Verified owner reads own brain spaces"
  on public.brain_spaces for select to authenticated
  using (owner_id = auth.uid() and public.is_verified_owner());
create policy "Verified owner creates own brain spaces"
  on public.brain_spaces for insert to authenticated
  with check (owner_id = auth.uid() and public.is_verified_owner());
create policy "Verified owner updates own brain spaces"
  on public.brain_spaces for update to authenticated
  using (owner_id = auth.uid() and public.is_verified_owner())
  with check (owner_id = auth.uid() and public.is_verified_owner());

create policy "Verified owner reads own brain sources"
  on public.brain_sources for select to authenticated
  using (owner_id = auth.uid() and public.is_verified_owner());
create policy "Verified owner appends own brain sources"
  on public.brain_sources for insert to authenticated
  with check (owner_id = auth.uid() and public.is_verified_owner());

create policy "Verified owner reads own brain records"
  on public.brain_records for select to authenticated
  using (owner_id = auth.uid() and public.is_verified_owner());
create policy "Verified owner creates own brain records"
  on public.brain_records for insert to authenticated
  with check (owner_id = auth.uid() and public.is_verified_owner());
create policy "Verified owner updates own brain record pointers"
  on public.brain_records for update to authenticated
  using (owner_id = auth.uid() and public.is_verified_owner())
  with check (owner_id = auth.uid() and public.is_verified_owner());

create policy "Verified owner reads own brain versions"
  on public.brain_record_versions for select to authenticated
  using (owner_id = auth.uid() and public.is_verified_owner());
create policy "Verified owner appends own brain versions"
  on public.brain_record_versions for insert to authenticated
  with check (owner_id = auth.uid() and public.is_verified_owner());

create policy "Verified owner reads own brain links"
  on public.brain_links for select to authenticated
  using (owner_id = auth.uid() and public.is_verified_owner());
create policy "Verified owner appends own brain links"
  on public.brain_links for insert to authenticated
  with check (owner_id = auth.uid() and public.is_verified_owner());

create policy "Verified owner reads own import batches"
  on public.brain_import_batches for select to authenticated
  using (owner_id = auth.uid() and public.is_verified_owner());
create policy "Verified owner creates own import batches"
  on public.brain_import_batches for insert to authenticated
  with check (owner_id = auth.uid() and public.is_verified_owner());
create policy "Verified owner updates own import batches"
  on public.brain_import_batches for update to authenticated
  using (owner_id = auth.uid() and public.is_verified_owner())
  with check (owner_id = auth.uid() and public.is_verified_owner());

create policy "Verified owner reads own retrieval audit"
  on public.brain_retrieval_audit for select to authenticated
  using (owner_id = auth.uid() and public.is_verified_owner());
create policy "Verified owner appends own retrieval audit"
  on public.brain_retrieval_audit for insert to authenticated
  with check (owner_id = auth.uid() and public.is_verified_owner());

create index if not exists brain_records_owner_space_category_idx
  on public.brain_records (owner_id, space_id, category, updated_at desc);
create index if not exists brain_record_versions_record_version_idx
  on public.brain_record_versions (record_id, version desc);
create index if not exists brain_sources_owner_key_idx
  on public.brain_sources (owner_id, source_key);
create index if not exists brain_retrieval_audit_owner_at_idx
  on public.brain_retrieval_audit (owner_id, at desc);

commit;

-- REVIEW GATES BEFORE APPLICATION
-- 1. Read-only comparison with the live CanX database and applied migrations.
-- 2. Security review of RLS, grants, storage, and service-role operations.
-- 3. Confirm whether protected vaults require separate databases or encryption
--    keys rather than logical separation in one database.
-- 4. Define and test import validation, duplicate detection, conflict handling,
--    content hashing, and rollback.
-- 5. Obtain John's exact approval before apply or import.

