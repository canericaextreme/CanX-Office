# Phase 1 bright office completion

## Subscription expiry and promotion filtering (2026-10-04)
- [x] Expand bounded Gmail search terms for expiry, renewal, trial, suspension and payment/card failure language.
- [x] Classify service/account deadlines separately from promotion expiry and identify what expires without overwriting confirmed records.
- [x] Derive relative deadlines only from source-email received time in Whitehorse and keep ambiguous or unanchored evidence in review.
- [x] Verify Coming due details, regressions, full tests, types and preview build without Gmail, database, paid calls or publication.

## Monthly subscription evidence organizer (2026-10-03)
- [x] Group saved email evidence by honest Whitehorse month with newest month open and undated evidence kept separate.
- [x] Add accessible month and needs-review filters plus coordinated type/status accents without implying payment.
- [x] Verify populated interactions, date boundaries, full tests, types and preview build without data writes or publication.

## Finance evidence label correction (2026-10-03)
- [x] Stop describing saved receipt/invoice email evidence as a filed or paid Finance receipt without verified linkage.
- [x] Separate visible review-item wording from paid-receipt totals and preserve neutral access to Finance.
- [x] Verify focused regressions, full tests, types and preview build without Gmail, database writes or publication.

## Dated Finance email catch-up (2026-10-03)
- [x] Add an editable 2026-08-15 From date and an explicit bounded historical scan for both linked mailboxes.
- [x] Freeze each run end, use inclusive America/Whitehorse boundaries, and persist only verified query-keyed per-mailbox progress.
- [x] Keep ordinary button and Elsie requests within the saved date scope, with honest running, paused, failed and complete states.
- [x] Verify date edges, multi-page completion/resume, query rekeying, duplicates and fail-closed behavior; run full checks without live Gmail or publication.

## Finance readback and receipt timestamps (2026-10-03)
- [x] Mirror migration 0004 duplicate matching across legacy and ingested records while strictly verifying newly filed rows.
- [x] Keep real save failures and read failures fail-closed with confirmed-filed-only counts and no checkpoint advance.
- [x] Show actual source-email received and imported/filed times in America/Whitehorse, with an explicit not-recorded state.
- [x] Verify focused regressions, full tests, types and preview build without Gmail, paid calls or publication.

## Finance navigation and normal email commands (2026-10-03)
- [x] Make Income, Expenses, Receipts and Tax prep open as accessible Finance sections with clear back navigation.
- [x] Open real receipt details and show truthful empty states without changing records or permissions.
- [x] Route explicit short email-check commands through the existing scoped receipt/subscription check; keep questions, negations and hypotheticals read-only.
- [x] Verify interactions, routing, tests, types and build in preview only; no live Gmail, paid provider call or publication.

## Active email-check status sheen (2026-10-03)
- [x] Show a gentle translucent yellow sweep only while the email check is actively running.
- [x] Keep completed partial results steady, clearly labelled, and verify reduced-motion/stopped-state behavior.
- [ ] Keep the receipt-zero investigation outstanding; this visual change does not verify receipt filing.

## Subscription Watch and ChatGPT shortcut (2026-09-11)
- [x] Replace AI Workers TBD summary with supplied verified OpenAI aggregate and honest partial-verification state
- [x] Add accessible AI Workers detail dialog with provider, Result, Evidence, and read-only editing notice
- [x] Add safe global ChatGPT new-tab shortcut without changing Office Manager
- [x] Run focused/full checks and desktop/mobile preview verification; do not publish

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
- [x] Gmail connections linked (canericaextreme + canerica14, read-only) and migration 0004 applied 2026-10-03 via Supabase MCP to project gmsjjiprtulxojhkmbqb; columns, RPC grants and RLS verified. Applied SQL recorded verbatim in docs/migrations/0004_finance_receipt_ingestion.sql. Remaining: signed-in preview trial of the receipt check. Safehighways remains unused.

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

## Subscriptions payment-notice truth repair (2026-10-04)
- [x] Separate invoice emails, explicit failure notices, payment-received evidence, and strictly matched resolutions in display logic.
- [x] Remove “still due” and current-failure claims from historical evidence; show neutral status-unverified wording and source dates/links.
- [x] Require same service, amount, currency, later evidence, and same invoice reference or billing month before displaying a resolution.
- [ ] Owner signed-in visual check remains required; no mailbox scan was run by the builder.

## Elsie routine Subscriptions review (2026-10-04)
- [x] Add conservative deterministic eligibility with distinct review provenance and reasons.
- [x] Add owner/MFA-protected verified batch save and compact Subscriptions action.
- [x] Route explicit typed and live-voice requests to the same operation; keep questions and negations read-only.
- [x] Verify mixed 120-item, idempotency, preservation and failed-readback behavior in tests.
- [ ] Owner must run the review signed in and inspect the items left for John.

## Elsie all-Subscriptions skill check (2026-10-04)
- [x] Route the exact room-wide command through the shared typed/live-voice Office request path without the three-task omission.
- [x] Enumerate all eight installed Subscriptions and linked Finance procedures from the canonical registry.
- [x] Use fresh owner/MFA-scoped Subscriptions and Finance reads, with per-skill completed, blocked or not-attempted evidence and checked time.
- [x] Keep missing usage, dependency, ledger and exact receipt-linkage inputs blocked; never infer execution or mark skills live-tested.
- [x] Test exact command, full enumeration, failed-source handling, blocked prerequisites, questions, negation and hypothetical wording.
- [ ] John must run the command signed in and review its real results; the builder did not perform a live room audit.

- [x] Office Manager Voice Mode: Talk button, live transcript, auto-send on pause, spoken answers, Mute/Stop listening/Repeat answer/End Voice Mode, browser-only speech, typed fallback. No recordings stored; approval rules unchanged.

## Manager voice upgrade (2026-09-11)
- [x] Natural conversational browser voice (voice selection, rate/pitch, sentence chunking)
- [x] Barge-in: speaking stops the moment John talks
- [x] Short spoken summaries by default; asks before reading long lists/answers
- [x] Read-only Manager access across rooms: Work Board, approvals, change log, room directory, Idea Garage/Bike Rack, feasibility queue
- [x] Voice task commands wired to the Work Board (create/assign a real task by speaking)

## ChatGPT companion popup (2026-09-11)
- [x] Open ChatGPT in one reusable desktop companion window with safe mobile/tab fallback
- [x] Verify focused tests, full tests, TypeScript, production build, and desktop/mobile preview

- Compact companion: draggable + saved position, assistant face icon, Chat drives Office Manager voice, Work opens the Manager panel, X collapses to a restorable edge tab; header ChatGPT shortcut removed (11 Sep 2026).

## CanX Chat companion (2026-09-12)
- Chat is now its own realtime spoken conversation (server-minted short-lived client secret, CanX-owned account); it no longer uses the Office Manager browser speech voice.
- Chat consults the Office Manager through one explicit `ask_office_manager` handoff; approval rules unchanged.
- OPEN: `OPENAI_REALTIME_MODEL` is not set on the server, so Chat fails closed with an honest message until John chooses the model.

## Astra persistent conversation repair (2026-09-25)
- [x] Owner-scoped device checkpoint (thread + draft), restore on reload, clear on sign-out/owner switch
- [x] Persistence-only outbox with idempotent turn IDs; retry on reconnect; never replay actions
- [x] Unapplied migration + server load/append with readback for cross-device checkpoint
- [x] Restored completed turns in typed and voice model context; interrupted prompts excluded and labelled
- [x] Focused tests, full suite, typecheck, build; no publish, no paid calls
- [ ] BLOCKED on John: apply docs/migrations/0008_astra_conversation_checkpoints.sql for cross-device sync
- [ ] BLOCKED on John: signed-in Android phone test (lose service mid-turn, reload, reopen)

- [x] Mail review filter (All/Related/Needs review/Ignored), Keep/Ignore + exact-sender rules, applied in ingestion, Elsie explicit-instruction path; stronger running sweep + static reduced-motion label (preview, 2026-10-03)
- [ ] Signed-in check of Saved mail review and running sweep on John's phone — blocked: needs John's signed-in session

- [ ] Room connection: John runs the all-room check signed-in on the current preview build (needs owner sign-in + MFA)
- [ ] Brain categories: John opens Brain signed-in and confirms categories, counts and one re-file (needs owner sign-in + MFA)

## Subscriptions layout repair — 4 Oct 2026
- [x] Owner reported "not categorized": room order is now Check emails → last check + category cards (open month list filtered) + bounded deadlines → month archive (Month / Evidence type / Needs review) → folded weekly emails/alerts → services → folded Saved mail review. Long lists labelled "Showing X of N" with Show all; no data changes.
- [x] Integrated SubscriptionManager test with 120 items (controls before long lists, older months collapsed, cards filter). 1,081 tests, typecheck, production build passed.
- [x] Refinement (John): hub shows compact month cards only (max 6 + older-month chooser); a month or category card opens a separate page with Back, Type/Needs review filters, 20-per-page "Show more" with real counts; weekly email/alert lists removed from hub; deadlines preview 3. 1,083 tests, typecheck, build passed.
- [ ] BLOCKED on John: refresh the preview (Ctrl+Shift+R) and check the signed-in Subscriptions room on phone and desktop.

## Subscriptions Skills installation — 4 Oct 2026
- [x] Scope correction applied: install only Subscriptions' four named jobs and linked Finance Subscription Review, Renewal Watch, Receipt Reconciliation and Budget Variance procedures; park every other room outline/draft.
- [x] Keep deterministic request-aware routing at three task skills, omitted-procedure disclosure, original core rules and shared typed/live-voice submit path.
- [x] Reconcile Subscriptions inputs against its shared snapshot; instructions remain distinct from connectors and owner live verification.
- [ ] BLOCKED on John: signed-in owner checks the Subscriptions room, dated two-mailbox catch-up/resume, totals/labels, month/review filters, expiry/promotion evidence and each installed procedure.
- [x] Superseded 3 Oct 18:14 Whitehorse: John authorised whole-office wiring.

## Subscription service cards and billing-statement extraction — 4 Oct 2026
- [x] Replace expanded service rows with bounded clickable cards and a focused detail/back view.
- [x] Preserve an optional owner-recorded plan name through validation and saving without changing old records.
- [x] During bounded Gmail processing, extract only explicitly stated plan, recurring amount/currency, interval and effective/billing date from readable source content.
- [x] Keep email-stated terms separate from owner-confirmed cost and renewal fields, with mailbox/message/date provenance and a reason.
- [x] Reject monthly-rate inference from annual charges, one-time receipts, tax totals, credits/top-ups, ambiguous dollar signs, promotions or conflicting terms.
- [x] Enrich matching historical evidence only when the same message is read again, preserving deduplication, Ignore and review decisions.
- [x] Add representative Lovable, Supabase, ChatGPT and OpenAI API fixtures plus negative/conflict tests.
- [x] Verify the preview build and focused interaction flow without a live mailbox or paid-provider call.
- [ ] BLOCKED on John: run the bounded signed-in mailbox check and visually verify service cards after preview repair.

## Subscription service-card recurrence clarity — 4 Oct 2026
- [x] Show each compact service card's rate, currency and separate recurring, not-recurring, usage-based or unconfirmed state.
- [x] Keep billing cadence separate from auto-renew status and preserve optional owner/source provenance without a schema change.
- [x] Add actual service, recurring, non-recurring, usage-based and unconfirmed counts without summing currencies.
- [x] Verify mixed monthly/yearly/non-recurring/usage/unknown records and source-email terms in tests.
- [ ] Owner signed-in visual check remains required; no mailbox scan or owner-data write was run by the builder.

## Subscriptions queued owner checks — 4 Oct 2026
- [x] Confirm historical payment labels never imply payment without supporting evidence; saved email rows remain evidence needing review and Finance receipts retain explicit payment state.
- [x] Confirm Elsie’s routine Subscriptions review uses a fresh AAL2 owner snapshot with saved service terms, evidence categories/review counts and last-check scope; it remains advisory.
- [x] Confirm recurring-rate displays keep owner-confirmed and email-stated values distinct, including annual billing and unknown currency/cycle cases.
- [x] Confirm every installed Subscriptions skill has meaningful diagnostics, deterministic routing, and honest connector/live-test status; all remain `toolConnected: false` and `liveTested: false` pending John’s signed-in checks.

## Subscription review-routing follow-up
- [ ] Do not blanket-approve existing needs-review records; design exception routing with explicit source/confidence rules and separate review state.

## Service edit selection fix (2026-10-04)
- [x] Edit opens the exact selected service by stable ID across switching, cancel and reopen; saves only that record.
- [ ] Owner signed-in check on Lovable/OpenAI edit remains required.

## Whole-office wiring (2026-10-04)
- [x] Install every named master-map job and the five actual-room skills; reserved/legacy stay inert.
- [x] Whole-office check through Elsie's shared typed/voice path: every room, every installed procedure, sources read/not read, missing inputs, next task, build-handoff status; never marks live-tested.
- [x] Checklist saved at docs/office-audit.md; AGENTS scope rule replaced.
- [ ] Shared roster / Idea Lab storage — blocked: needs John-approved schema change.
- [ ] Codex build handoff live readiness — blocked: GitHub repo variable/secret not verifiable from here.
