# Elsie bounded text-task loop — candidate, 24 October 2026

Status: implementation tested locally; not deployed or accepted live. This replaces neither native chat apps nor an unattended worker. PR229 documented the gap without adding runtime capability. The subsequent remote Codex run failed before implementation with provider quota exceeded; this candidate was implemented locally.

## What runs

The new `run_elsie_text_task` MCP action enters `/api/office-work` under the existing live working-grant check. The caller explicitly supplies a task UUID, exact Brain specification ID, active standing-rule UUID, colleague, current bounded writing instruction and stable request UUID. The task must be owned, open/active, green and assigned to Office Manager. Every continuation retrieves all three exact records and compares source versions. Saved text is context, not authority for any additional action.

One invocation performs at most one model call:

1. Elsie coordinates a text assignment, using her existing `MANAGER_SYSTEM_PROMPT` and configured `OPENAI_MODEL` with no tools.
2. The selected Office API worker produces the requested text with fresh task/spec/rule and Elsie-plan context, with no tools.
3. Elsie reports the actual worker response and provider receipts, with no tools.

The caller continues with **identical arguments only when `continue=true`**. Each phase is persisted and independently read back in its own owner-scoped Brain note, `elsie-loop-<SHA256(owner:requestId)>`. Only the final saved/read-back phase returns `ok=true`. The original task, specification, rules and prior history are untouched. A native connected worker can independently read this note with the ordinary records tool; receiving the returned text alone is not cross-worker retrieval proof.

## Claims, errors and spending

Existing `canx_write_office_record` unique inserts and exact-version row-locked CAS provide the authoritative request/phase claim before a paid call. No new table, migration, policy, grant, service-role access or cached session exists. Actual AAL is retained; the ordinary interactive manager's AAL2 checks are unchanged. This entry point exposes only bounded internal text generation, not the general manager tool set, builds, external actions, autonomous pickup or background execution.

Every actual model call rechecks working access, reserves against the existing budget and verifies settlement by independently reading the exact reservation's owner, estimate, outcome and settlement timestamp. Failure never triggers another provider attempt. Source/response size bounds refuse excessive content rather than cutting it. Persistence recovery retries only the exact result write after verifying the unchanged claimed version. Failed readback returns recovery text without a success claim.

Interrupted claims are not replayed. After two minutes they can be CAS-marked `unknown`; the coordinating assistant owns receipt inspection/output recovery in the active session. No automatic requeue or background recovery is implied. A process dying after a provider reply but before persistence can still leave an unknown outcome; it cannot safely be repaired by repeating the paid call.

## Related relay defect

A read-only live schema check confirmed task `result` and `evidence` each have a 2,000-character CHECK. The older relay assumed an 8,000-character capacity and silently sliced complete output to 1,800 characters. This candidate preflights conservative space against the actual task limits before a paid relay call, and returns oversized full replies as unverified recovery instead of silently claiming a truncated reply is complete. Longer exchange history uses the new per-request Brain record. Existing task history is never shortened or overwritten.

## Validation and limits

- Full local suite: 218 files / 2,115 tests passed; typecheck and production build passed (build repeated after final edits before delivery).
- New orchestration tests cover coordinator → worker → report, fresh sources, independent Brain readback, concurrent/repeated requests, source changes, foreign/revoked access, closed/non-green tasks, budget/provider/settlement failure, source/output bounds, uncertain claims and persistence-only recovery.
- Server-adapter tests exercise actual RPC routing, budget reservation/settlement readback, actual provider HTTP request construction and the configured Elsie/worker identities with synthetic responses; fixtures are not live provider evidence.
- Office Claude reviewed supplied concurrency and access-boundary code excerpts. Feedback about stalled claims produced the explicit `unknown` transition. This is a bounded excerpt review, not full-repository or live approval.
- No signed-in browser, microphone, live endpoint, native Claude session or unattended acceptance is claimed.

## Release and live acceptance

This changes connector-gateway files, which the repository merge robot reserves for owner review. Review the exact candidate before release. No auto-merge label is applied. Deployment needs the checked app version and the changed MCP tool registry bundle; merging alone never proves the app was published. The active client must discover the new tool before testing.

After release, use the existing owner-approved test task and its exact Brain request/standing rule. Invoke the new tool with one request UUID and current explicit writing instruction. Collect all three phases using the same arguments; inspect model IDs, source versions, settlement receipts and exact final Brain content. Have another independently connected assistant retrieve and accurately explain that result. Repeat with the other worker, then test revoked access, duplicate/concurrent calls and controlled uncertainty without replaying work. Keep the larger Office foundation task open until the agreed live and bidirectional checks pass. This bounded text loop does not establish automatic synchronization of all native-chat conversations.
