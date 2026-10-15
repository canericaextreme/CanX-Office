# Repair Elsie's manager builder handoff

An explicit green CanX Office code-change request now invokes the existing builder submission tool even when the reasoning model returns a conversational answer. A separate preview is not required. A short explicit agreement (such as “Yes, go ahead”) can continue the immediately preceding explicit owner code-change scope; assistant prose never supplies execution scope.

OfficeManager supplies request UUIDs for text and realtime voice. The manager saves an owner task receipt, reuses exact matching unfinished drafts, and submits through the existing compare-and-set task executor. Duplicate requests with a linked run check that exact run instead of dispatching again. Uncertain attempts remain claimed and are never automatically retried. Returned answers include the chosen builder, task ID and actual run ID/URL when supplied; missing run references remain unconfirmed. Existing task evidence records confirmed run state and never marks candidates done or published. Existing workbench refresh events feed room activity views.

Existing owner verification, approval, protected-action classification, budgets and builder bridges are retained. Room navigation, minimized voice and fresh visual inspection continue through their existing paths. No credentials, workflows, dependencies, infrastructure or migrations changed.

## Local test evidence

- Final full Vitest suite: 160 files, 1,624 tests passed. Added manager-adapter fixtures prove default Codex and explicitly named Claude handoff despite false model preview prerequisites, then checking the same run on repeat.
- `npm run typecheck`: passed.
- `npm run build`: production build passed; existing server-function deprecation and bundler warnings remain.
- `git diff --check`: passed.
- New fixtures cover text and voice submission, exact run references, agreement resolution, duplicate checks, exact draft reuse, lost responses, missing run identifiers, unreadable receipts and request-ID scope collisions. Existing fixtures cover owner/budget denial, protected work, builder choice and voice lifecycle.

## Remaining live verification and limits

Build 23 (GitHub Actions run 38671436495) failed before proposing a PR because a legacy voice callback test rejected an explicit undefined optional argument. Its candidate was recovered from its job log without starting another paid build. The compatibility fix omits the second callback argument when no request ID exists. Final local validation above passed before publication; signed-in functional verification remains separate.

Owner-signed-in verification remains required: submit one small green repair by text and by voice; confirm the accepted builder, returned run link and saved Work Board receipt; repeat the same request and verify that only the existing run is checked; inspect queued/running/failed/success evidence in Build & Testing and Brain activity. Check approval/budget refusal and connection failure without retrying an uncertain dispatch.

Test microphone permissions, interruption, reconnection and minimized navigation on John's actual phone/tablet and desktop browser. Ask a fresh visual question after navigation to confirm a new capture. Fixture passes and a local production build are not live Office health verification.

Draft reuse is deliberately exact scope matching, not semantic matching. Handoff scopes above the existing 2,000-character saved-task limit are refused rather than silently truncated. Short agreement only continues the immediately preceding explicit owner code-change request; ambiguous discussion requires a restated scope. Status updates use existing explicit checks, not a new background monitor. Legacy callers without request UUIDs retain their existing direct-tool behavior; the repaired OfficeManager text and realtime paths supply UUIDs.
