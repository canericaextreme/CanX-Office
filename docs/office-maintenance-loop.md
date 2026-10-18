# Office maintenance: active-request intake

John's 17 October instruction: routine Office problems should be managed inside the Office, with owner decisions and genuine blockers escalated. Claude is currently reconciling historical build records; do not edit that work or assign his next job until John says he is finished.

## Implemented candidate

An explicit **Run office maintenance** request to Elsie uses a deterministic server path before either model. It verifies the existing owner/MFA session, reads canonical saved-data room sources sequentially and records confirmed read failures as internal diagnostic Work Board tasks assigned to Elsie. Each task requires a cause, proposal and fresh verification evidence. A source identity hashed with the owner ID gives each intake task a stable database primary key, so repeated/concurrent checks cannot create duplicate tasks. Saves are read back. An uncertain write is not retried.

Existing task assignments, results, evidence, completion and archive decisions are preserved. A previously closed maintenance task with a recurring failure is reported unresolved instead of reopened. Denied access is reported for owner attention, never repaired by changing grants. Unavailable, stale, wrong-build, wrong-room, partial, capped and device-only evidence stays incomplete rather than becoming a fault or an all-clear. Static skill/input gaps are not flooded onto the Work Board as repair jobs. The ordinary whole-office audit remains read-only.

The concise intake outcome is saved and independently read back as a Reception room report. This is a saved-data check, not visual, voice, mobile or release verification. The new path makes no provider calls and starts no paid build. It does not modify Finance, authentication, budgets, workflows, deployments or task queues.

## Still required for a working unattended loop

- Install the secure production adapter described in `elsie-phase-four-activation.md`; its scheduler hook is currently disabled and the worker is absent.
- Connect scoped, owner-revocable unattended identity, leases and authoritative cost reservations to the existing task executor. Never reuse owner MFA tokens in scheduled jobs.
- Bind each diagnostic task to a permitted repair, builder receipt, independent review and post-repair evidence. Intake assignment is not execution; a successful build is not a deployed verified repair.
- End-to-end verify expiry, revocation, duplicate ticks, uncertain submission, failed reads, budget exhaustion and escalation delivery before activating unattended dispatch.

This candidate is one concrete part of the maintenance loop. It does **not** establish autonomous repairs or turn overall Office health green. Production activation and publication are not performed by this change.

## Validation

Local full suite: 185 test files, 1,825 tests passed. Type checking, production build and lint on the new modules passed. Maintenance fixtures cover owner denial, concurrent checks, uncertain writes, unreadable task lookups, preserved completion/assignments, source freshness and separation of access/device limitations from repairable read failures. These are local checks; signed-in acceptance and unattended execution have not been verified live.
