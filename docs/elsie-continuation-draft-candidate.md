# Elsie handoff continuity — local draft candidate

Owner-requested replacement candidate following reported failed run 39796628492 (reported to have produced no PR). This checkout did not inspect or modify that production run, create a PR, or contact builders. Existing drafts 208, 209 and 210 were not accessed or changed.

Implemented:
- Exact short commands: Proceed, proceed with that, continue, carry on, finish that (case insensitive, optional please and terminal punctuation).
- Read existing persisted Work Board tasks using the verified owner's ID before resolving any short command. No assistant text or browser history supplies task identity or execution authority.
- Require exactly one fresh active CanX Office task. Fresh means created within 24 hours, not recently updated by polling. Multiple candidates, unavailable/incomplete reads and no candidate ask the owner to name the task without submitting work.
- Green open tasks proceed through the existing Codex executor, scope checks and compare-and-set receipt. Waiting tasks, Claude assignments and claim/handoff evidence require clarification.
- Reopened sessions use the same saved records. Recorded Codex attempts use execution checks only; failure and uncertain submission do not authorize a replay. Returned progress comes from executor/status receipts, never a generated promise.
- Injected queue executors start together and settle before context and room snapshots. Production retains the existing autopilot step. The queue-before-snapshot regression assertion remains unchanged.
- ChatGPT and Claude links have a fixed quarter-inch CSS gap; the dock is taller to accommodate it.

Validation uses stub executors and owner-scoped record fixtures, including stop/discussion, ambiguity, age, owner isolation, protected scope, reopen, uncertain attempts and concurrent duplicates. No authentication, authorization, budgets, credentials, database or dependency changes.

Acceptance still needs device checks for typed and spoken commands, reopen, mobile dragging and button separation. CSS inches are browser reference units, not a guaranteed physical measurement on every screen. Local tests cannot establish signed-in production health, a real build run, a PR, publication or voice-device behavior.

Completed local checks: full Vitest suite — 209 files, 2,030 tests passed; TypeScript typecheck passed; production build passed (existing createServerFn deprecation and bundler warnings). The unchanged elsie-voice-faster.test.ts queue-before-snapshot regression passed. git diff --check passed.
