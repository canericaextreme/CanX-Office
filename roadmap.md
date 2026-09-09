# Phase 1 bright office completion

- [x] Build and verify the reception-only CanX character sample for visual approval

- [x] Brighten shared design system and all destinations
- [x] Replace abstract 3D grid with recognizable lightweight office scene
- [x] Complete Brain search, filters, zoom/reset, breadcrumbs, list, and details
- [x] Correct Back, Home, and typed search results/no-results state
- [x] Verify tour, keyboard, reduced motion, contrast, desktop/mobile, routes, build, and page errors
- [x] Capture requested screenshots and performance measurements

## Office Manager, brain, and round table (this stage)
- [x] Interactive code-native CanX Brain with category/status modes, drilldown, search, zoom, list fallback, reduced motion
- [x] Office Manager dock on every room: chat UI, honest disconnected state, office briefing written by the app
- [x] Server-side provider adapter — OpenAI Responses API preferred, Lovable gateway off unless deliberately enabled
- [x] Allowlisted appearance preview / Apply / Undo (device-only)
- [x] Saved tasks and decisions (device-only)
- [x] Monday 14 September 2026 round table draft: agenda, seats, notes, decisions, actions, save/reload/export/import
- [x] Setup notes (docs/office-manager-setup.md) and proposed backend schema (docs/backend-schema.sql, not applied)
- [ ] Backend provider decision — CanX-owned Supabase recommended, nothing provisioned
- [ ] OPENAI_API_KEY not configured, so the manager's AI is not connected

## Review fixes (pre-activation defects)
- Office Manager fails closed: no owner sign-in with MFA, so no provider call is ever made, even with a key present. No bypass flag.
- Lovable gateway execution path removed.
- Status distinguishes auth unavailable / configured-but-unverified / not configured / verified. Verified requires a live health check, never secret presence.
- Client office context sent as fenced untrusted data; system instructions immutable.
- Provider errors sanitized (no upstream body/keys) and bounded by a 45s timeout.
- Per-record provenance on saved notes and meeting decisions/actions; John's records are not called demonstration data.
- Transparency, text density and movement settings now actually change rendered panels and text.
- Phones show full-size room cards instead of a shrunken floor.
- Reference SQL: owner-only policies require owner role AND aal2 AND owner_id; file remains unapplied and implements no auth.
- Tests: src/lib/manager.functions.test.ts (3 passing).

## Connections & readiness work (2026-09-09)
- Systems room rebuilt as an honest two-group connection inventory (ChatGPT-verified accounts snapshot vs connections this office needs). Nothing shows connected unless checked live.
- CanX-owned Supabase integration written end to end, configuration-ready and fail-closed: server adapter, browser client, owner sign-in + TOTP UI, owner-gated notes/round-table CRUD, append-only audit.
- Manager AI now requires: configured DB -> valid session -> owner role from DB -> AAL2 -> durable spend/rate reservation -> live provider health check. No env bypass, no gateway fallback.
- Reference migrations at docs/migrations/0001_canx_office_core.sql and 0002_ai_limits.sql. NOT APPLIED. Setup steps in docs/office-manager-setup.md.
- Monday 14 Sep 2026 round table: readiness checklist added; time still unset; no calendar entry; Claude shown disconnected.
- Open: John must create the CanX-owned Supabase project at https://lovable.dev/dashboard?connectors. Backups untested (no account yet).

## External CanX Supabase connection (2026-09-09, later)
- [x] Confirmed no agent tool can link an external Supabase project; only Lovable Cloud provisioning exists, which is forbidden here.
- [x] Agent integrations (MCP) left OFF: only anonymous public access is offered, John requires owner-authenticated only.
- [x] CANX_SUPABASE_URL set to the canericaextreme project gmsjjiprtulxojhkmbqb.
- [x] Browser Supabase config now served by this app's server (VITE_ secret names are reserved by Lovable and cannot be set).
- [x] Migration 0001 given explicit schema-usage grants; no anon grant anywhere (automatic exposure is off).
- [x] Setup guide corrected: real Supabase MFA recovery process, AI limit numbers marked illustrative not an approved allocation.
- [ ] BLOCKED on John: add CANX_SUPABASE_PUBLISHABLE_KEY in Project Settings -> Secrets.
- [ ] Then: run the three migrations in the project SQL editor, create the owner account, grant owner role, enrol authenticator.
- [ ] Finance: 12 prepared receipts not imported; import happens from a private JSON file John selects, never from source or seed SQL.

## External Supabase status — 9 Sep 2026
- Setup script `docs/migrations/ALL_canx_office_setup.sql` reported as applied by John
  in project gmsjjiprtulxojhkmbqb ("Success. No rows returned", user screenshot).
  Recorded on the owner's word — not independently verified by this office.
  Do not re-run the script.
- Read-only checks from here: Auth service healthy (200); anonymous read of
  public.user_roles refused (permission denied). Refusal confirms anonymous access
  is closed; it is not proof that every table/policy in the script exists.
- Onboarding order confirmed non-circular: server checks two-step (aal2) before
  owner role, the sign-in screen offers authenticator set-up in the
  "two-step required" state, and own-role reads need no aal2.
- Still off: owner auth user, owner role row, TOTP, paid AI (no budget rows).

## Idea Lab / Bike Rack (added 9 Sep 2026)
- src/lib/idea-lab.ts — Opportunity Score + Evidence Confidence, 14 weighted criteria,
  evidence reliability tiers, recency weighting, evidence-based decay, lifecycle bands
  (70+/55-69/<55/<45), protection, rising ideas, rack focus limit, research planner.
- src/lib/idea-lab-store.ts — device-only evidence/overrides/proposals/policy storage,
  strict validation of untrusted evidence input.
- src/components/office/IdeaLab.tsx — lanes, cards (score, confidence, trend, status,
  last researched, evidence count, time to first dollar, why the score changed),
  evidence trail + breakdown dialog, evidence entry, Decision Room tracks.
- src/lib/idea-lab.test.ts — 16 tests (scoring, reliability, decay, lifecycle,
  protection, rising, rack limit, research gating, untrusted input).
- Not live: no research service, no web/API scanning, no Innovation AI generation loop.
  Research cadence/budget values are recorded only; nothing runs and nothing can spend.
