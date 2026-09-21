# Second Eyes approval and voice HTTP 429

The owner's screenshot confirms rejection of the live voice SDP request with HTTP 429. That status alone does not establish whether the cause is exhausted API credit, request/token rate, or concurrent-session capacity. The office's own budget is a separate gate and was passed before this request. No provider billing or model limits were changed.

## Changes

- Added a yellow Approvals-room button that explicitly authorizes and runs one read-only whole-office Claude review. It shows the existing C$0.15 internal budget reservation (an estimate, not a guaranteed provider charge), accepts optional owner instructions, and uses the existing server-side owner/MFA/context/budget checks.
- A synchronous lock prevents double clicks. No review runs on page load, no automatic retry or recurring review is added, and no generic approval is treated as provider-credit purchasing authority.
- Completed findings open in Second Eyes; incomplete/failing results are labeled honestly. The existing review store is browser-session-only; this change does not add durable report storage. The existing AI usage ledger records the reservation.
- Voice startup now reads only provider error code/type and numeric Retry-After to distinguish known quota and rate failures. Raw upstream messages, account ids and keys are never rendered. An unidentified 429 stays explicitly unidentified.

## Verification and remaining blocker

522 tests passed across 40 files; TypeScript and production build passed. Regression tests cover one-click invocation, double-click prevention, MFA denial, failed-review handling, quota versus rate errors, and secret-safe diagnostics.

No paid Claude/voice call was made during validation. The cloud browser is signed out of CanX Office and the OpenAI Platform. A signed-in provider-account check and end-to-end voice/Claude tests remain outstanding. Do not report live voice restored from this source change alone.

Provider reference: https://developers.openai.com/api/docs/guides/error-codes
