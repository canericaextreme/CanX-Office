-- Office work-event recorder: the database writes a line in office_work_events
-- whenever a Work Board task or a project plan changes room or stage, whoever
-- made the change (Work Board, Elsie, builders, ChatGPT/Claude tools).
-- Approved by John, 18 Oct 2026, for the live Brain view.
--
-- Rules:
--  * The recorder can never block real work: any problem is logged as a
--    warning and the task or plan save goes ahead unchanged.
--  * It only ever ADDS lines; office_work_events stays append-only.
--  * Rooms come from the team member on the task (src/lib/office-team.ts
--    home rooms). Builders (Claude, ChatGPT/Codex) work in Build & Testing.
--  * Stages: open -> strategizing (brainstorming for Ideas & Research),
--    in_progress -> building, waiting -> stalled, done -> completed,
--    cancelled -> completed with source "task-cancelled" (so charts can tell
--    finished from cancelled). Project plan stages: planned -> strategizing,
--    building/testing -> building, blocked -> stalled,
--    ready/market/completed -> completed; unknown or empty -> not recorded.
--  * The recorder functions cannot be called directly by anyone.

CREATE OR REPLACE FUNCTION public.office_work_room_for_worker(_worker text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE lower(btrim(coalesce(_worker, '')))
    WHEN 'office manager' THEN '/reception'
    WHEN 'astra' THEN '/reception'
    WHEN 'elsie' THEN '/reception'
    WHEN 'finance officer' THEN '/finance'
    WHEN 'operations lead' THEN '/work-board'
    WHEN 'projects lead' THEN '/projects'
    WHEN 'ideas & research' THEN '/idea-garage'
    WHEN 'systems & security' THEN '/systems'
    WHEN 'claude' THEN '/build-testing'
    WHEN 'chatgpt' THEN '/build-testing'
    WHEN 'codex' THEN '/build-testing'
    ELSE '/work-board'
  END
$$;

CREATE OR REPLACE FUNCTION public.office_work_kind_for_worker(_worker text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN lower(btrim(coalesce(_worker, ''))) IN ('claude','chatgpt','codex') THEN 'office-build' ELSE 'task' END
$$;

CREATE OR REPLACE FUNCTION public.office_work_stage_for_task(_status text, _worker text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE _status
    WHEN 'open' THEN CASE WHEN lower(btrim(coalesce(_worker, ''))) = 'ideas & research' THEN 'brainstorming' ELSE 'strategizing' END
    WHEN 'in_progress' THEN 'building'
    WHEN 'waiting' THEN 'stalled'
    WHEN 'done' THEN 'completed'
    WHEN 'cancelled' THEN 'completed'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.office_work_stage_for_plan(_stage text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE lower(btrim(coalesce(_stage, '')))
    WHEN 'planned' THEN 'strategizing'
    WHEN 'building' THEN 'building'
    WHEN 'testing' THEN 'building'
    WHEN 'blocked' THEN 'stalled'
    WHEN 'ready' THEN 'completed'
    WHEN 'market' THEN 'completed'
    WHEN 'completed' THEN 'completed'
    ELSE NULL
  END
$$;

-- A plan's room if it is a real Office room; otherwise the Projects room.
CREATE OR REPLACE FUNCTION public.office_work_plan_room(_room text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN _room IN ('/reception','/owner-desk','/approvals','/idea-garage','/office-team','/records','/blueprint','/systems','/health','/communications','/legal','/subscriptions','/finance','/work-board','/build-testing','/safe-highways','/research','/family-continuity','/future','/brain','/projects','/skills','/round-table','/analytics')
    THEN _room ELSE '/projects' END
$$;

CREATE OR REPLACE FUNCTION public.office_record_task_work_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  new_room text := public.office_work_room_for_worker(NEW.worker);
  new_stage text := public.office_work_stage_for_task(NEW.status, NEW.worker);
  old_room text;
  old_stage text;
BEGIN
  IF new_stage IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' THEN
    old_room := public.office_work_room_for_worker(OLD.worker);
    old_stage := public.office_work_stage_for_task(OLD.status, OLD.worker);
    IF old_room IS NOT DISTINCT FROM new_room AND old_stage IS NOT DISTINCT FROM new_stage THEN RETURN NULL; END IF;
  END IF;
  INSERT INTO public.office_work_events (owner_id, subject_kind, subject_id, from_room, to_room, from_stage, to_stage, source)
  VALUES (NEW.owner_id, public.office_work_kind_for_worker(NEW.worker), NEW.id::text, old_room, new_room, old_stage, new_stage,
          CASE WHEN NEW.status = 'cancelled' THEN 'task-cancelled' ELSE 'work-board' END);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'office work-event recorder skipped task %: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.office_record_plan_work_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  new_plan jsonb;
  old_plan jsonb;
  new_room text;
  new_stage text;
  old_room text;
  old_stage text;
BEGIN
  IF NEW.source IS DISTINCT FROM 'Project register: plan' THEN RETURN NULL; END IF;
  new_plan := NEW.detail::jsonb;
  new_stage := public.office_work_stage_for_plan(new_plan->>'stage');
  IF new_stage IS NULL THEN RETURN NULL; END IF;
  new_room := public.office_work_plan_room(new_plan->>'room');
  IF TG_OP = 'UPDATE' AND OLD.source = 'Project register: plan' THEN
    BEGIN
      old_plan := OLD.detail::jsonb;
      old_room := public.office_work_plan_room(old_plan->>'room');
      old_stage := public.office_work_stage_for_plan(old_plan->>'stage');
    EXCEPTION WHEN OTHERS THEN
      old_room := NULL; old_stage := NULL;
    END;
    IF old_stage IS NULL THEN old_room := NULL; END IF;
    IF old_room IS NOT DISTINCT FROM new_room AND old_stage IS NOT DISTINCT FROM new_stage THEN RETURN NULL; END IF;
  END IF;
  INSERT INTO public.office_work_events (owner_id, subject_kind, subject_id, from_room, to_room, from_stage, to_stage, source)
  VALUES (NEW.owner_id, 'project', left(NEW.title, 80), old_room, new_room, old_stage, new_stage, 'project-plan');
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'office work-event recorder skipped plan %: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS office_task_work_event ON public.manager_tasks;
CREATE TRIGGER office_task_work_event
  AFTER INSERT OR UPDATE OF status, worker ON public.manager_tasks
  FOR EACH ROW EXECUTE FUNCTION public.office_record_task_work_event();

DROP TRIGGER IF EXISTS office_plan_work_event ON public.office_notes;
CREATE TRIGGER office_plan_work_event
  AFTER INSERT OR UPDATE OF detail, source ON public.office_notes
  FOR EACH ROW EXECUTE FUNCTION public.office_record_plan_work_event();

-- Nobody calls these directly; only the triggers run them.
REVOKE ALL ON FUNCTION public.office_record_task_work_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.office_record_plan_work_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.office_work_room_for_worker(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.office_work_kind_for_worker(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.office_work_stage_for_task(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.office_work_stage_for_plan(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.office_work_plan_room(text) FROM PUBLIC, anon, authenticated;

-- Starting point: one line for each task that is still active, dated at its
-- last update, so the Brain view and the 7-day stalled rule start from the
-- truth instead of an empty room. Runs once (skips anything already seeded).
INSERT INTO public.office_work_events (owner_id, subject_kind, subject_id, from_room, to_room, from_stage, to_stage, source, occurred_at)
SELECT t.owner_id, public.office_work_kind_for_worker(t.worker), t.id::text, NULL,
       public.office_work_room_for_worker(t.worker), NULL, public.office_work_stage_for_task(t.status, t.worker), 'starting-point',
       least(t.updated_at, now())
FROM public.manager_tasks t
WHERE t.status IN ('open','in_progress','waiting')
  AND NOT EXISTS (
    SELECT 1 FROM public.office_work_events e
    WHERE e.subject_id = t.id::text AND e.source = 'starting-point'
  );
