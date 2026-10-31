# Background task state machine — inactive implementation

Status: BLOCKED for scheduled execution. This checkout does not establish a running background service, unattended authority, or a completed Safe Highways task. No production system was called.

## Implemented

`src/lib/background-task.ts` provides one bounded invocation with queued/running/waiting/paused/cancelled/blocked/unknown/verified states. Each logical job keeps one execution step identifier. Revision compare-and-save plus independent readback fence concurrent workers. A 60-second lease allows recovery of an interrupted worker, but recovery only reconciles receipts; it never repeats a submission. Three total attempts bound execution plus receipt checks, with 30/60/120-second backoff. Unknown results stop automatically. A stale worker cannot overwrite a newer pause/cancel or claim.

`background-task.server.ts` implements checkpoint reads and conditional writes in an existing owner-only office_notes row, using the existing Workbench owner verification and REST transport. It validates the stored schema and binds owner, note, task and step across updates. There is no checkpoint enrolment endpoint or initial row creation. No table, migration, credentials or authorization changed. This adapter requires a dedicated note with source `CanX background checkpoint` and a JSON detail produced by `newBackgroundTask`. Production support for conditional note PATCH and returned representations remains unverified.

The execution adapter calls `executeTaskWith`, including its existing task guards, claims, builder choice and budget controls. Recovery calls its check-only path. A builder success stops at blocked: candidate checks do not verify the requested outcome. The generic verified state requires an independent nonempty outcome receipt from a future approved verifier; the builder adapter never emits it.

Pause/resume/cancel are server library controls requiring a fresh permission decision. Resume of attempted work only reconciles. Cancellation does not cancel an external run already dispatched, and there is an unavoidable boundary between the final permission read and an external submission. Existing executor checks still apply. No new UI control endpoint has been exposed.

Analytics Builder Performance now shows the blocked activation status and the exact saved Work Board assignment `43da2350-e1aa-4d22-a1da-9885295888be`, with the same execution-evidence label used by Work Board. Missing or unreadable assignment data remains unknown. This does not seed, modify, submit or complete the Safe Highways assignment. The current Analytics bounded task read can omit older assignments; absence is not evidence that a task does not exist.

## Activation prerequisites — incomplete

1. Separately authorize and connect a server scheduler and revocable unattended owner identity. Do not reuse a browser token as an unattended credential. Existing owner/MFA, autopilot, working-grant, budget and per-builder capacity controls must be checked freshly for every tick through the `permitted` adapter. That adapter is not wired here.
2. Connect scheduler discovery, dedicated checkpoint enrolment, and existing owner controls to these library functions. Verify that the live note API performs atomic conditional updates and independent readback. Per-job leases do not implement global builder capacity; retain the existing backend builder admission controls.
3. Supply a task-specific independent outcome verifier with durable receipt readback, and reconciliation of already dispatched external cancellation. Do not infer success from HTTP status, a run's success, assistant prose or an assignment's presence.
4. Add owner-scoped checkpoint reads to the existing Analytics source and PR236 progress contract. PR236 is not present in this checkout (local history ends at merge #235); no remote request was made. Its API/component cannot be truthfully integrated here. Current Analytics shows saved assignment/build progress and blocked scheduler state, not live checkpoint telemetry.
5. With separate permission for server activation and live calls, run one harmless task on the actual deployed server, interrupt it, recover without resubmission, exercise controls and authorization revocation, then independently verify outcome readback. This acceptance remains BLOCKED by the current prohibition on production calls and protected changes.
6. Signed-in desktop and mobile device acceptance must confirm Analytics/progress readability, existing control behavior and current-build room health. Local fixtures do not establish device or saved-data production health.

## Local validation

Unit coverage includes concurrent claims, expired-lease interruption recovery, cancellation before and during a step, authorization denial, unknown outcomes, bounded retries, pause/resume, failed claim readback, conditional checkpoint persistence, and harmless read-only use of the actual server executor with fixture transports. These tests do not demonstrate live scheduling, production persistence, PR236 integration or a real Safe Highways execution.
