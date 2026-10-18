# Brain office network — local draft, 18 October 2026

Existing tracking was confirmed before implementation: `office-activity-log.ts` stores up to 40 real review jobs on the current device, with start/end state and last heartbeat. Only ClaudeReviewPanel and SecondEyesPanel emit these records. `work-activity.ts` applies a 90-second freshness gate. The existing BrainMap uses a separate illustrative cell/edge registry. Room snapshots and project plans are separate evidence and do not constitute a room-to-room activity stream.

This draft adds explicit room/stage metadata and bounded per-task handoff history to the existing device log. `updateActivityRoom(taskId, roomId, stage)` is the producer hook for actual room movement and heartbeats; same-room updates do not invent handoffs, and completed tasks cannot be revived. Existing review producers identify Systems / strategizing. Other workflows have not been wired: do not interpret missing records as idle work or a connected whole-office feed. No automatic room changes are inferred from browsing, titles or legacy Brain cell IDs.

Brain renders every canonical room, stage colors, one-shot handoff sparks and active-room pulses; all motion stops with reduced motion or stale heartbeats. Faint hub connections show structure, blue lines show observed handoffs. Multiple tasks use stalled, building, strategizing, brainstorming, completed priority for a room's aggregate color. Failure/cancellation is grouped with stalled; no evidence is gray/unknown. Analytics shows static room-count bars from the same source, with retained handoff totals and no invented time/productivity series. Retention is bounded (40 jobs, 40 handoffs per job), not a durable audit trail. Local storage is untrusted device evidence, not verified shared status.

The Elsie button uses the existing unsent manager handoff, carrying only room/stage counts and evidence limits. It makes no provider call and does not start speech. John must submit the draft and use the existing voice session to request narration. Automatic verbal board narration is not implemented or verified.

## Explicit missing work

Three.js is absent from package.json and this checkout. The owner prohibited dependency changes, so the renderer is SVG and is labeled as such. This is **not a completed three.js implementation**. A later authorized dependency change is required for a locally bundled three.js renderer; no CDN download, vendored library, new paid service or production call was used. Shared real-time activity across devices/background jobs needs an authorized source integration and producer coverage; this draft introduces no database, authorization or infrastructure changes.

No publish/push/merge or production verification. No paid API or build service calls were made; external execution cost was zero. The coding session's billing is not measurable from this checkout, so the $2 total build cap cannot be certified here.

## Local acceptance still needed

Check Brain and Analytics signed in on desktop and a narrow mobile screen, label readability with all rooms present, actual producer start/finish, a real instrumented room handoff, heartbeat expiry, reduced motion and storage denial. Verify that spark movement follows each actual handoff once and stops at the destination, and that Elsie's reviewed voice narration matches the board. Fixture tests do not satisfy signed-in release health verification. This remains an unpublished draft.

Local validation: 35 tests passed across office-network, office-activity-log, work-activity, OfficeNetwork component and Analytics suites. TypeScript typecheck, targeted ESLint for the tracker/new modules and tests, and `git diff --check` passed. A production bundle build was not run because generated build artifacts would be outside the task's allowed source/document/test paths. No browser/device or live voice verification was performed.
