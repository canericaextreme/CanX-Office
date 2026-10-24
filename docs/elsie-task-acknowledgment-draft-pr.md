# Draft PR: Document missing Elsie task acknowledgment capability

Status: local draft only; no GitHub PR opened. The requested functional repair is blocked by missing connector capability, not a demonstrated defect in an existing acknowledgment executor.

## Changed

Added two local regression cases for repeated Office Manager acknowledgment requests. The saved-task executor refuses unsupported work without changing the task, fabricating a receipt or dispatching a build. The connector refuses an Elsie relay without substituting Claude or ChatGPT. These are negative coverage; successful Elsie delivery, persisted acknowledgment and acknowledgment deduplication remain unimplemented and untested.

## Evidence and missing work

- `src/lib/task-execution.server.ts`, `executeTaskWith`: the existing saved-task executor supports only green CanX Office code changes dispatched to Codex or Claude. Its durable receipt records a builder attempt, not Elsie's receipt of a task.
- `src/lib/manager.functions.ts`, `execute_task`: Elsie's interactive tool invokes that same builder executor. Assigning a task to Office Manager does not invoke her chat or persist her acknowledgment.
- `src/lib/office-work.server.ts`: connector actions are submit, status, relay and relay_read; relay recipients are only Claude and ChatGPT.
- `src/lib/colleague-relay.ts`: likewise only Claude and ChatGPT have provider dispatch and saved-reply handling. There is no Elsie recipient implementation to repair by changing a name or passing an existing task id.

The supplied task is `0e4dc517-7c81-4edf-a239-66fe12b98e51`; specification reference is `office_notes/brain-loop-test-20261024-a`. Neither record is in this checkout. They were not fetched because production calls were prohibited. The new fixture uses these references with explicitly synthetic scope; it does not reproduce the unknown live task contents or assert that the task is acknowledgment-only.

Next work needs the specification contents and an agreed Elsie delivery/receipt capability. Reuse existing owner checks, budget controls and saved task storage where appropriate; require one durable claim before any model execution, verified acknowledgment readback, concurrent/repeated-request coverage and no replay after uncertain execution. Do not mistake another assistant's reply or a builder receipt for Elsie's acknowledgment. No new connection, permission, database, deployment or spending changes are included here; if required, they need separately scoped work.

## Tested

`npm run typecheck` passed.

The following focused run passed: 10 files, 220 tests (including the two new cases):

```sh
npx vitest run src/lib/task-execution.test.ts src/lib/office-work.server.test.ts src/lib/colleague-relay.test.ts src/lib/elsie-continuation.test.ts src/lib/manager.functions.test.ts src/lib/manager-voice-audit.test.ts src/lib/manager-voice-lifecycle.test.ts src/lib/manager-voice-playback.test.ts src/lib/manager-realtime.test.ts src/lib/builder-connections.test.ts
```

Existing cases cover saved colleague reply reuse, uncertain attempts, concurrent claim conflicts, builder duplicate prevention, continuation and voice behavior with fixtures. Test exit code was zero. Existing toolchain deprecation warnings appeared; the GitHub summary reporter could not write outside the read-only sandbox. No live systems or providers were called.

## Security

No runtime, authentication, authorization, credential, connection or spending-control changes. No live security verification performed.

## Database

No database changes or migrations. No records read or written in production.

## Known issues

Elsie acknowledgment is still unavailable through the inspected connector. This draft is evidence and regression coverage, not a completed implementation. No runtime or voice code changed. No publish, push, merge, external PR creation or contact occurred.

## Next recommended step

Review the actual specification in a separately authorized environment before implementing a new delivery capability. After implementation, verify the exact saved task, one independently read-back Elsie acknowledgment, and no duplicate execution/receipt on repeat or concurrent delivery. Signed-in desktop and phone testing, including Elsie's normal voice session, remains necessary; fixture tests cannot establish live delivery or device audio behavior.
