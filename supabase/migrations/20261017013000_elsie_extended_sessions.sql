-- Draft only. Apply only after code review; no job is scheduled by this migration.
-- Owner-scoped extended sessions; application server must use AAL2 at enrollment
-- and a separately audited/revocable scoped work grant for unattended execution.
CREATE TABLE IF NOT EXISTS public.elsie_work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','active','paused','stopped','expired')),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  daily_cap_cents integer NOT NULL CHECK (daily_cap_cents >= 0),
  per_build_cap_cents integer NOT NULL CHECK (per_build_cap_cents > 0),
  stop_requested boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT max_ten_hour_window CHECK (expires_at > starts_at AND expires_at <= starts_at + interval '10 hours')
);
CREATE INDEX IF NOT EXISTS elsie_work_sessions_owner_state ON public.elsie_work_sessions (owner_id,state,expires_at);
ALTER TABLE public.elsie_work_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.elsie_work_sessions FROM anon;
REVOKE ALL ON public.elsie_work_sessions FROM authenticated;
-- Read only; changes MUST use vetted server RPC with owner+MFA and version CAS.
GRANT SELECT ON public.elsie_work_sessions TO authenticated;
DROP POLICY IF EXISTS elsie_work_sessions_owner_read ON public.elsie_work_sessions;
CREATE POLICY elsie_work_sessions_owner_read ON public.elsie_work_sessions FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.elsie_work_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES public.elsie_work_sessions(id) ON DELETE RESTRICT,
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 event_type text NOT NULL CHECK (event_type IN ('created','started','paused','resumed','stopped','expired','budget_blocked','task_queued','task_released','task_failed','status_verified')),
 task_id uuid NULL,
 builder text NULL CHECK (builder IN ('codex','claude')),
 detail text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS elsie_work_events_owner_session ON public.elsie_work_events (owner_id,session_id,occurred_at);
ALTER TABLE public.elsie_work_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.elsie_work_events FROM anon;
REVOKE ALL ON public.elsie_work_events FROM authenticated;
GRANT SELECT ON public.elsie_work_events TO authenticated;
DROP POLICY IF EXISTS elsie_work_events_owner_read ON public.elsie_work_events;
CREATE POLICY elsie_work_events_owner_read ON public.elsie_work_events FOR SELECT TO authenticated USING (owner_id = auth.uid());
-- Never expose INSERT/PATCH/DELETE directly to client; trusted server RPC only.
