# Phase 1 bright office completion

## Subscription Watch and ChatGPT shortcut (2026-09-11)
- [x] Replace AI Workers TBD summary with supplied verified OpenAI aggregate and honest partial-verification state
- [x] Add accessible AI Workers detail dialog with provider, Result, Evidence, and read-only editing notice
- [x] Add safe global ChatGPT new-tab shortcut without changing Office Manager
- [ ] Run focused/full checks and desktop/mobile preview verification; do not publish

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

## Secure Manager receipt review (2026-09-10)
- [x] Detect Finance intent from only the latest validated user message.
- [x] Add a server-built, read-only, sanitized receipt-detail section capped at 100 records.
- [x] Preserve aggregate-only context for unrelated questions and all existing security gates.
- [x] Prove allowed fields, forbidden-field privacy, injection-data boundaries, cap behavior, stale-context exclusion, and fail-closed behavior.
- [x] Run focused tests, full tests, typecheck, and production build; do not deploy.
- [x] Fail closed before reservation/provider access when a requested receipt document is malformed.
- [x] Make aggregate privacy wording accurately distinguish detailed review from aggregate-only requests.
- [x] Verify both corrections with focused tests, full tests, typecheck, and production build; do not deploy.

## Owner-only Gmail receipt ingestion (2026-09-10)
- [x] Route only explicit receipt/invoice retrieval requests into a narrow server-side ingestion path before any OpenAI call.
- [x] Require verified owner AAL2, the existing CanX database, and a distinct linked CanX Google Mail connector; fail closed otherwise.
- [x] Add bounded Gmail/MIME/PDF/image candidate handling, conservative extraction, untrusted-data treatment, and per-currency summaries.
- [x] Add additive migration `0004_finance_receipt_ingestion.sql` with atomic locking, idempotent dedupe, checkpointing, audit counts, and verified read-back.
- [x] Preserve legacy receipt JSON and the existing 12 records without rewriting them.
- [x] Focused tests: 16 passed across 3 files. Full suite: 159 passed across 12 files. TypeScript and production build passed.
- [ ] Blocked on one setup action: create/link a distinct CanX Google Mail connection and apply migration 0004 to the existing CanX database. Safehighways remains unused.

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
- Office Manager activation repair (approved): bound fetch wrapper + trim OPENAI_API_KEY/OPENAI_MODEL in realDeps(), focused tests, full checks. No provider calls, no deploy.
- Later activation only: record John's Office Manager cap C$35 CAD/month (~US$25 at 2026-09-10 working rate); do not reinterpret the C$500 total office ceiling.

## Work Board fix (in progress)
- [x] Result/Evidence always shown ("Not recorded" when empty); editable in edit + verify
- [x] Blue badge "Blue — actively moving" separate from risk label
- [x] Grey status system: Planned/Disconnected/Unknown/Stale, labelled with reason
- [ ] Publish and report live status

- [x] Office Manager Voice Mode: Talk button, live transcript, auto-send on pause, spoken answers, Mute/Stop listening/Repeat answer/End Voice Mode, browser-only speech, typed fallback. No recordings stored; approval rules unchanged.

## Manager voice upgrade (2026-09-11)
- [x] Natural conversational browser voice (voice selection, rate/pitch, sentence chunking)
- [x] Barge-in: speaking stops the moment John talks
- [x] Short spoken summaries by default; asks before reading long lists/answers
- [x] Read-only Manager access across rooms: Work Board, approvals, change log, room directory, Idea Garage/Bike Rack, feasibility queue
- [x] Voice task commands wired to the Work Board (create/assign a real task by speaking)
