-- Office work events: the append-only record of work moving between rooms.
-- Approved by John, 18 Oct 2026, for the live Brain board (three.js), the
-- static Analytics charts and Elsie's board summary.
--
-- Applying this file is a separate step: merging to main does NOT run
-- migrations (see docs/office-view-install.md). Apply only with John's
-- go-ahead, then confirm with the checks at the bottom of this file.
--
-- Rules:
--  * One row = one real change of room and/or stage. Rows are never edited
--    or deleted, by anyone, including server code (trigger below).
--  * Owner-only reads and writes. Assistant (OAuth client) tokens cannot
--    read or write rows directly; they need a later, separately approved
--    reader.
--  * Stages match src/lib/work-board.ts: brainstorming, strategizing,
--    building, stalled, completed. "Stalled after 7 days with no event" is
--    worked out when reading, not stored.

CREATE TABLE IF NOT EXISTS public.office_work_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  subject_kind text NOT NULL CHECK (subject_kind IN ('task','project','office-build')),
  subject_id text NOT NULL CHECK (length(subject_id) BETWEEN 1 AND 80),
  from_room text NULL,
  to_room text NOT NULL,
  from_stage text NULL,
  to_stage text NOT NULL,
  source text NOT NULL CHECK (source ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT office_work_events_rooms CHECK (
    to_room IN ('/reception','/owner-desk','/approvals','/idea-garage','/office-team','/records','/blueprint','/systems','/health','/communications','/legal','/subscriptions','/finance','/work-board','/build-testing','/safe-highways','/research','/family-continuity','/future','/brain','/projects','/skills','/round-table','/analytics')
    AND (from_room IS NULL OR from_room IN ('/reception','/owner-desk','/approvals','/idea-garage','/office-team','/records','/blueprint','/systems','/health','/communications','/legal','/subscriptions','/finance','/work-board','/build-testing','/safe-highways','/research','/family-continuity','/future','/brain','/projects','/skills','/round-table','/analytics'))
  ),
  CONSTRAINT office_work_events_stages CHECK (
    to_stage IN ('brainstorming','strategizing','building','stalled','completed')
    AND (from_stage IS NULL OR from_stage IN ('brainstorming','strategizing','building','stalled','completed'))
  ),
  -- An event must record a real change: a new item, a room move or a stage change.
  CONSTRAINT office_work_events_is_change CHECK (
    from_room IS NULL OR from_room <> to_room OR from_stage IS NULL OR from_stage <> to_stage
  ),
  CONSTRAINT office_work_events_time_sane CHECK (occurred_at <= created_at + interval '5 minutes')
);

CREATE INDEX IF NOT EXISTS office_work_events_owner_time
  ON public.office_work_events (owner_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS office_work_events_owner_subject
  ON public.office_work_events (owner_id, subject_kind, subject_id, occurred_at DESC);

ALTER TABLE public.office_work_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.office_work_events FROM anon;
REVOKE ALL ON public.office_work_events FROM authenticated;
GRANT SELECT, INSERT ON public.office_work_events TO authenticated;

DROP POLICY IF EXISTS office_work_events_owner_read ON public.office_work_events;
CREATE POLICY office_work_events_owner_read ON public.office_work_events
  FOR SELECT TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND (SELECT auth.jwt()->>'client_id') IS NULL
    AND public.has_role((SELECT auth.uid()), 'owner')
  );

DROP POLICY IF EXISTS office_work_events_owner_insert ON public.office_work_events;
CREATE POLICY office_work_events_owner_insert ON public.office_work_events
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND (SELECT auth.jwt()->>'client_id') IS NULL
    AND public.has_role((SELECT auth.uid()), 'owner')
  );
-- No UPDATE or DELETE policy or grant: the record is append-only.

-- Belt and braces: block edits and deletes even for server/service-role code.
CREATE OR REPLACE FUNCTION public.office_work_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'office_work_events is append-only; % is not allowed', TG_OP
    USING errcode = '42501';
END;
$$;

DROP TRIGGER IF EXISTS office_work_events_no_update ON public.office_work_events;
CREATE TRIGGER office_work_events_no_update
  BEFORE UPDATE OR DELETE ON public.office_work_events
  FOR EACH ROW EXECUTE FUNCTION public.office_work_events_append_only();

DROP TRIGGER IF EXISTS office_work_events_no_truncate ON public.office_work_events;
CREATE TRIGGER office_work_events_no_truncate
  BEFORE TRUNCATE ON public.office_work_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.office_work_events_append_only();

-- Live updates for the Brain board (row security still applies to realtime).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'office_work_events'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.office_work_events;
  END IF;
END;
$$;

-- After applying, confirm (read-only):
--   select relrowsecurity from pg_class where oid = 'public.office_work_events'::regclass;  -- true
--   select polname, polcmd from pg_policy where polrelid = 'public.office_work_events'::regclass;  -- read + insert only
--   select tgname from pg_trigger where tgrelid = 'public.office_work_events'::regclass and not tgisinternal;  -- both triggers
