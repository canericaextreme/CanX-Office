-- =====================================================================
-- CanX Office — optional project label on Manager tasks.
--
-- STATUS: NOT APPLIED. Optional. Apply only to the existing CanX-owned
-- external database. Purely additive: no table is created, renamed, reset
-- or dropped, and no existing row is rewritten.
--
-- The Manager workbench works without this column. When the column is
-- missing, the app saves tasks without a project label instead of failing.
-- =====================================================================

alter table public.manager_tasks
  add column if not exists project text not null default ''
  check (char_length(project) <= 160);
