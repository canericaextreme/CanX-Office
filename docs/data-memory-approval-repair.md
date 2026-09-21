# Data conversation and approval repair

## Behavior

A direct owner request authorizes ordinary internal work; it does not need a second approval. Spending, deletion, external commitments and material legal, safety or security risks retain separate controls. Data has no tool for approving on behalf of the owner.

Live voice now exposes one bridge, `submit_office_request`. It uses the actual current user transcript, not model-generated action arguments, and submits it through the existing authenticated Manager pipeline. Function-call ids and input ids are tracked to avoid duplicate submissions within a voice session. Closing voice prevents unsent actions and late replies; it cannot undo a request already accepted by the server.

Conversation turns are stored privately in the existing append-only `manager_changes` log with entity `manager_conversation`. Owner verification and existing row-level policies apply. No new schema, public access or credentials are needed. Reopening the Manager restores the most recent 100 messages; typed replies and new voice sessions receive bounded recent context. Older messages remain stored, but are not all injected into every prompt. Unsaved conversations from before this change cannot be reconstructed.

Pending approvals display yellow, carry a persisted approval id in the result, and refresh the Manager, Approvals room and live room count. The Approvals room no longer substitutes sample requests if its real records cannot load. A failed save is reported as a failure, not a completed action.

## Validation

507 tests passed across 36 files, including new private-history access/ordering/failure tests, voice-to-action/deduplication/cancellation tests, routine-task routing, approval persistence and failed-approval reporting. TypeScript and production build passed. Live signed-in microphone, cross-device history and production task/approval writes remain acceptance checks.

Realtime implementation reference: https://developers.openai.com/api/docs/guides/realtime-conversations

## Acceptance check after publishing

1. Ask Data to create an ordinary named test task. Confirm it appears on the Work Board without a separate approval request.
2. Close/reopen the Manager, then refresh the page. Confirm the conversation is restored and Data can identify the task.
3. Explicitly ask to queue a named purchase proposal without buying anything. Confirm a yellow item and saved approval id appear; no purchase is made.
4. End voice during connection and while waiting for an answer. The microphone stays off; no unsent request is executed.

The independent Chat companion and automatic ChatGPT-to-Brain synchronization are outside this change.
