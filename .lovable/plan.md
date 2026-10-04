# Full-office operational baseline

## Scope
Preserve the completed Subscriptions repairs, then expand the authorised work from Subscriptions-only to every current Office room and auxiliary destination. “Live” means honestly operational in preview where existing verified APIs support it; it never means publish, spend, send, delete, change accounts, or mark untested work green.

## Implementation
1. Replace the obsolete room-by-room restriction in the governing Office rules with the 3 October full-office authorisation and its safety boundaries.
2. Expand every current named master-map skill and the five actual-room drafts into complete, versioned, app-owned instructions. Keep reserved, future, and historical entries inactive.
3. Preserve the normal three-task instruction limit for typed and voice requests, while adding an explicit deterministic whole-office skill audit that enumerates every installed skill without silent omission.
4. Build the audit from the canonical room map, auxiliary room identities, skill registry, room snapshot contract, and existing actions. For every room, report installed instructions, source/tool/action availability, missing inputs, test state, current-build owner verification state, and exact next task.
5. Use fresh owner-scoped reads through the existing authentication and two-step verification path. Run only supported internal read-only checks; unsupported external capabilities remain blocked and named precisely.
6. Save a durable repository checklist so no room is silently dropped in later stages. Add focused tests for full room/skill coverage, bounded routing, blocked inputs, partial source failures, reserved/history exclusions, and no blanket live-tested state.
7. Verify focused tests, the full suite, types, and preview build. Do not run owner-authenticated checks, mailbox scans, paid calls, migrations, or publication.

## Technical details
- Canonical rooms: `OFFICE_MAP_ROOMS` plus auxiliary identities from the shared room identity adapter.
- Canonical procedures: the versioned Office Skills registry; skills remain separate from tools, connections, and live-test evidence.
- Audit command: explicit whole-office wording through the same `submit_office_request` path used by typed and live voice; status questions and negated/hypothetical requests remain read-only.
- Output statuses: completed, blocked, or not attempted, each with source/freshness evidence and a required next step. “Configured,” “connected,” “tested,” and “owner verified” remain distinct.
