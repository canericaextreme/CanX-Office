# Elsie extended-work runner: deployment requirements

**Status: foundation only.** The policy in `elsie-extended-work.ts` and its unit tests cannot run work by themselves. Do not claim ten-hour unattended execution until the server worker is installed, consented, connected and end-to-end verified.

## Intended workflow
1. Owner explicitly authorizes a bounded session (maximum ten elapsed hours), sets a CAD daily build budget and maximum per-task amount. Existing monthly limits and provider caps still apply. Save an auditable owner-scoped session with start, expiry and stop switch. Authentication must be supported for unattended work through a narrowly scoped renewable grant; never cache raw passwords, OTPs or a whole owner session.
2. Elsie maintains up to three explicitly owner-queued green tasks **per builder** with priority, dependencies, project, creator/assigner, expected cost and completion criteria. Store durable task origin (John / Elsie), timestamps and immutable history. Existing queue markers and atomic `canx_mcp_claim_elsie_task` apply; do not reinterpret ordinary named tasks as authorized.
3. A server-owned scheduler periodically wakes (e.g. every 5 minutes), obtains an owner+builder lease, rereads grants, builder status, current daily/monthly budget reservations, and task evidence. It invokes `decideExtendedWork` and ONLY when it says release, the existing scoped claim + builder executor. One in flight per builder. This loop must NOT depend on chat turns.
4. After each run, poll the exact saved runId. A failure creates a bounded diagnosis task or escalation, never blindly resubmits the same charged run. A successful draft produces tests/review and a release-ready handoff; it does NOT merge or publish. Next authorized queue task may start if capacity and cost checks pass.
5. Save every transition and receipt to Work Board plus an indexed Brain progress record, with readback. Provide a morning/owner-return summary: completed, working, queued, money remaining, blocked and owner decisions.
6. At expiration, owner stop, spending ceiling, lost grant, failure to verify budget, authorization issue or serious technical problem: halt new dispatch and retain exact state. Never weaken MFA. Do not silently elevate permissions or auto-merge. A paused worker may finish safe status checks, but must not launch a new build.

## Important implementation gaps before activation
- Durable `extended_work_sessions`, append-only events, and owner-scoped revocable grants; audit and tested RLS.
- Scheduled server runner with distributed lease, bounded execution, retry policy and no duplicate dispatch.
- Authoritative DAILY spending budget / provider costs and reservation readback; provider API limits and the owner's existing monthly ceilings. If usage cannot be verified, stop. Daily cap cannot be guessed from monthly cap.
- Per-builder run tracking/status, task dependency resolution, queue capacity, and completion/review signals.
- UI to enable/stop session, view queue and daily consumption; simple owner reporting in Elsie. ELI10 explanation skill for all states.
- Regression + end-to-end tests for lost lease, repeated callbacks, crash/restart, midnight/day-boundary, expiry, revoked grant, exhausted credit and owner approval stop.
- Recovery path with last known stable deployment, tested rollback; don't blindly reverse DB migrations.

## Existing parts to reuse, not duplicate
`elsie-task-queue.ts`, `task-execution.server.ts`, scoped SQL task claim, `manager.functions.ts`, Work Board, Brain, existing status builders, existing owner/MFA and budget server checks. The current manager queue auto-advance happens on a **new owner chat turn**, not a background scheduler.

## Boundaries
No purchases/upgrades, no GitHub merges or live deployment without required approval; no changing Finance permissions or Safe Highways systems. Cloud scheduling is not guaranteed by a GitHub Actions tick unless durable scoped identity, budget reservations and idempotent execution exist. Preserve task and artifact history.

## Schema candidate prepared (not installed)
The proposed `supabase/migrations/20261017013000_elsie_extended_sessions.sql` adds owner-readable, non-client-writable sessions and append-only events with ten-hour boundaries. It does not grant unattended authentication or start a scheduler. Owner stop/pausing and exact task binding are covered by pure logic and tests. Do not apply the migration until an independently reviewed enrollment/stop RPC and worker lease service are available; a table by itself is not the working system.
